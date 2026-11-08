import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auth0, auth0Configured } from "@/lib/auth0";
import { getMarketplaceDatabase } from "@/lib/marketplace-database";
import { MARKETPLACE_CATEGORIES, SELLING_CONDITIONS } from "@/lib/marketplace-options";
import { searchMarketplaceListings } from "@/lib/listing-store";
import { syncAuth0User } from "@/lib/sync-auth0-user";
import {
  MARKETPLACE_CONDITIONS as FILTER_CONDITIONS,
  MARKETPLACE_SORTS,
  type MarketplaceSort,
} from "@/lib/marketplace-filters";

export function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const rawPage = searchParams.get("page") ?? "1";
  const page = Number(rawPage);
  const conditions = [...new Set(searchParams.getAll("condition"))];
  const minPrice = parsePrice(searchParams.get("minPrice"));
  const maxPrice = parsePrice(searchParams.get("maxPrice"));
  const rawSort = searchParams.get("sort") ?? "newest";
  const validConditions = new Set<string>(FILTER_CONDITIONS.map(({ value }) => value));

  if (query.length > 100) {
    return Response.json(
      { error: "Search must be 100 characters or fewer." },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return Response.json(
      { error: "Page must be a positive integer." },
      { status: 400 },
    );
  }

  if (conditions.some((condition) => !validConditions.has(condition))) {
    return Response.json({ error: "One or more conditions are invalid." }, { status: 400 });
  }

  if ((minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
      (minPrice !== null && maxPrice !== null && minPrice > maxPrice)) {
    return Response.json({ error: "Enter a valid minimum and maximum price." }, { status: 400 });
  }

  if (!MARKETPLACE_SORTS.includes(rawSort as MarketplaceSort)) {
    return Response.json({ error: "Sort order is invalid." }, { status: 400 });
  }

  try {
    const result = searchMarketplaceListings(query, page, {
      conditions,
      minPrice,
      maxPrice,
      sort: rawSort as MarketplaceSort,
    });
    return Response.json(
      { ...result, page },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to fetch marketplace listings:", error);
    return Response.json(
      { error: "Marketplace listings are temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: "webp", signature: (bytes: Buffer) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
} as const;

type StoredPhoto = { filename: string; bytes: Buffer };

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin || requestOrigin !== new URL(request.url).origin) {
    return Response.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await auth0?.getSession();

  const url = new URL(request.url);

  const localDemo =
    process.env.NODE_ENV === "development" &&
    process.env.DEMO_VISION_NO_AUTH === "true" &&
    !auth0Configured &&
    ["localhost", "127.0.0.1"].includes(url.hostname);

  if (!session?.user?.sub && !localDemo) {
    return Response.json(
      { error: "Sign in to submit a listing." },
      { status: 401 }
    );
  }

  const sellerId = session?.user?.sub ?? "local-demo-seller";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The listing form could not be read." }, { status: 400 });
  }

  const title = formString(form, "title").trim();
  const category = formString(form, "category");
  const condition = formString(form, "condition");
  const description = formString(form, "description").trim();
  const rawPrice = formString(form, "price").trim();

  if (title.length < 3 || title.length > 120) {
    return Response.json({ error: "Title must be between 3 and 120 characters." }, { status: 400 });
  }
  if (!MARKETPLACE_CATEGORIES.some(([value]) => value === category)) {
    return Response.json({ error: "Choose a valid category." }, { status: 400 });
  }
  if (!SELLING_CONDITIONS.some(([value]) => value === condition)) {
    return Response.json({ error: "Choose a valid condition." }, { status: 400 });
  }
  if (!/^\d+(\.\d{1,2})?$/.test(rawPrice)) {
    return Response.json({ error: "Enter a valid price with up to two decimal places." }, { status: 400 });
  }
  const priceCents = Math.round(Number(rawPrice) * 100);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
    return Response.json({ error: "Price must be greater than zero." }, { status: 400 });
  }
  if (description.length < 10 || description.length > 2000) {
    return Response.json({ error: "Description must be between 10 and 2,000 characters." }, { status: 400 });
  }

  const uploadedFiles = form.getAll("photos");
  if (uploadedFiles.length < 1 || uploadedFiles.length > MAX_PHOTOS || uploadedFiles.some((file) => typeof file === "string")) {
    return Response.json({ error: `Add between 1 and ${MAX_PHOTOS} photos.` }, { status: 400 });
  }

  const photos: StoredPhoto[] = [];
  for (const upload of uploadedFiles) {
    if (!(upload instanceof File) || upload.size === 0 || upload.size > MAX_PHOTO_BYTES) {
      return Response.json({ error: "Each photo must be a non-empty image no larger than 10 MB." }, { status: 400 });
    }
    const imageType = IMAGE_TYPES[upload.type as keyof typeof IMAGE_TYPES];
    if (!imageType) {
      return Response.json({ error: "Photos must be JPG, PNG, or WebP images." }, { status: 400 });
    }
    const bytes = Buffer.from(await upload.arrayBuffer());
    if (!imageType.signature(bytes)) {
      return Response.json({ error: "A photo's file contents do not match its image type." }, { status: 400 });
    }
    photos.push({ filename: `${randomUUID()}.${imageType.extension}`, bytes });
  }

  const database = getMarketplaceDatabase();
  const userId = session?.user
  ? syncAuth0User(session.user)
  : localDemo
    ? syncAuth0User({
        sub: "local-demo-seller",
        name: "FairMarket Demo Seller",
      })
    : null;
  console.log("DEBUG seller ID:", userId);
  console.log(
    "DEBUG seller exists:",
    database.prepare("SELECT user_id FROM users WHERE user_id = ?").get(userId)
  );
  console.log(
    "DEBUG category exists:",
    database.prepare("SELECT category_id FROM categories WHERE category_id = ?").get(category)
  );

  const uploadDirectory = resolve(
    process.cwd(),
    process.env.APP_UPLOAD_DIRECTORY ?? "../backend/databases/uploads/listings",
  );
  const savedFiles: string[] = [];
  try {
    await mkdir(uploadDirectory, { recursive: true });
    for (const photo of photos) {
      const path = resolve(uploadDirectory, photo.filename);
      await writeFile(path, photo.bytes, { flag: "wx", mode: 0o640 });
      savedFiles.push(path);
    }

    const listingId = randomUUID();
    const now = new Date().toISOString();
    const photoUrls = photos.map(({ filename }) => `/api/listings/images/${filename}`);
    const createListing = database.transaction(() => {
      database.prepare(`
        INSERT INTO items (
          item_id, seller_id, category_id, title, description, price,
          quantity, item_condition, status, created_at, updated_at
        ) VALUES (
          @itemId, @sellerId, @categoryId, @title, @description, @price,
          1, @condition, 'active', @now, @now
        )
      `).run({
        itemId: listingId,
        sellerId: userId,
        categoryId: category,
        title,
        description,
        price: Number(rawPrice),
        condition,
        now,
      });

      const insertImage = database.prepare(`
        INSERT INTO item_images (image_id, item_id, image_url, display_order, created_at)
        VALUES (@imageId, @itemId, @imageUrl, @displayOrder, @createdAt)
      `);
      photoUrls.forEach((imageUrl, index) => {
        insertImage.run({
          imageId: randomUUID(),
          itemId: listingId,
          imageUrl,
          displayOrder: index + 1,
          createdAt: now,
        });
      });
    });
    createListing();

    return Response.json({ listing: { id: listingId, title, category, price: Number(rawPrice), condition, description, photos: photoUrls } }, { status: 201 });
  } catch (error) {
    await Promise.all(savedFiles.map((path) => unlink(path).catch(() => undefined)));
    console.error("Unable to save submitted marketplace listing:", error);
    return Response.json({ error: "Your listing could not be saved. Please try again." }, { status: 500 });
  }
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function parsePrice(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  return Number(value);
}
