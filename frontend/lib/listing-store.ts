import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { MarketplaceSort } from "./marketplace-filters";

export type MarketplaceListing = {
  id: string;
  routeId: string;
  source: string;
  title: string;
  price: number;
  category: string;
  condition: string | null;
  listedDate: string | null;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  sellerUsername: string | null;
};

export type MarketplaceListingDetail = MarketplaceListing & {
  description: string | null;
  imageUrls: string[];
};

type ListingDatabaseGlobal = typeof globalThis & {
  marketplaceListingDatabase?: Database.Database;
};

const globalForDatabase = globalThis as ListingDatabaseGlobal;

function getDatabase() {
  if (globalForDatabase.marketplaceListingDatabase) {
    return globalForDatabase.marketplaceListingDatabase;
  }

  const databasePath = resolve(
    process.cwd(),
    process.env.MARKETPLACE_DATABASE_PATH ?? "../backend/databases/marketplace.db",
  );
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });

  globalForDatabase.marketplaceListingDatabase = database;
  return database;
}

const MARKETPLACE_PAGE_SIZE = 30;
const SELLER_DISPLAY_NAME = `CASE
  WHEN seller.email IS NOT NULL AND TRIM(seller.email) <> '' THEN seller.email
  WHEN seller.username IS NOT NULL
    AND seller.username NOT LIKE 'auth0:%'
    THEN seller.username
  WHEN instr(TRIM(COALESCE(seller.first_name, '') || ' ' || COALESCE(seller.last_name, '')), '@') = 0
    AND TRIM(COALESCE(seller.first_name, '') || ' ' || COALESCE(seller.last_name, '')) <> ''
    THEN TRIM(COALESCE(seller.first_name, '') || ' ' || COALESCE(seller.last_name, ''))
  ELSE 'JBay member'
END`;

/** Search active listings and return the first attached image for each item. */
export function searchMarketplaceListings(
  search = "",
  page = 1,
  filters: {
    minPrice?: number | null;
    maxPrice?: number | null;
    conditions?: string[];
    sort?: MarketplaceSort;
  } = {},
): { listings: MarketplaceListing[]; hasNextPage: boolean; totalPages: number } {
  const query = search.trim();
  const database = getDatabase();
  const offset = (page - 1) * MARKETPLACE_PAGE_SIZE;
  const selectedConditions = filters.conditions ?? [];
  const conditionFilter = selectedConditions.length
    ? `AND item_condition IN (${selectedConditions.map((_, index) => `@condition${index}`).join(", ")})`
    : "";
  const sortOrder = {
    newest: "item_created_at DESC, item_id ASC",
    price_low_high: "price ASC, item_created_at DESC, item_id ASC",
    price_high_low: "price DESC, item_created_at DESC, item_id ASC",
  }[filters.sort ?? "newest"];
  const bindings: Record<string, string | number | null> = {
    query,
    limit: MARKETPLACE_PAGE_SIZE + 1,
    offset,
    minPrice: filters.minPrice ?? null,
    maxPrice: filters.maxPrice ?? null,
  };
  selectedConditions.forEach((condition, index) => {
    bindings[`condition${index}`] = condition;
  });

  const rows = database.prepare(`
    SELECT
      item.item_id AS id,
      item.title,
      item.price,
      category.category_id AS category,
      item.item_condition AS condition,
      item.created_at AS listedDate,
      ${SELLER_DISPLAY_NAME} AS sellerUsername,
      NULL AS brand,
      NULL AS model,
      (
        SELECT image.image_url
        FROM item_images AS image
        WHERE image.item_id = item.item_id
        ORDER BY image.display_order ASC
        LIMIT 1
      ) AS imageUrl,
      item.created_at AS item_created_at,
      COUNT(*) OVER () AS totalCount
    FROM items AS item
    LEFT JOIN categories AS category ON category.category_id = item.category_id
    LEFT JOIN users AS seller ON seller.user_id = item.seller_id
    WHERE item.status = 'active'
      AND (
        @query = '' OR
        instr(lower(item.title), lower(@query)) > 0 OR
        instr(lower(COALESCE(item.description, '')), lower(@query)) > 0 OR
        instr(lower(COALESCE(category.category_name, '')), lower(@query)) > 0
      )
      AND (@minPrice IS NULL OR item.price >= @minPrice)
      AND (@maxPrice IS NULL OR item.price <= @maxPrice)
      ${conditionFilter}
    ORDER BY ${sortOrder}
    LIMIT @limit OFFSET @offset
  `).all(bindings) as (Omit<MarketplaceListing, "routeId" | "source"> & {
    totalCount: number;
    item_created_at: string;
  })[];

  const hasNextPage = rows.length > MARKETPLACE_PAGE_SIZE;
  const totalCount = rows[0]?.totalCount ?? 0;
  const listings = rows.slice(0, MARKETPLACE_PAGE_SIZE).map((listing) => ({
    id: listing.id,
    title: listing.title,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    listedDate: listing.listedDate,
    sellerUsername: listing.sellerUsername,
    brand: listing.brand,
    model: listing.model,
    imageUrl: listing.imageUrl,
    source: "jbay",
    routeId: `jbay~${listing.id}`,
  }));

  return {
    listings,
    hasNextPage,
    totalPages: Math.ceil(totalCount / MARKETPLACE_PAGE_SIZE),
  };
}

/** Find an active marketplace item by its app route id. */
export function getMarketplaceListingByRouteId(routeId: string): MarketplaceListingDetail | null {
  const separator = routeId.indexOf("~");
  if (separator <= 0 || separator === routeId.length - 1) return null;

  const source = routeId.slice(0, separator);
  const id = routeId.slice(separator + 1);
  if (source !== "jbay") return null;

  const row = getDatabase().prepare(`
    SELECT
      item.item_id AS id,
      item.title,
      item.price,
      category.category_id AS category,
      item.item_condition AS condition,
      item.created_at AS listedDate,
      ${SELLER_DISPLAY_NAME} AS sellerUsername,
      NULL AS brand,
      NULL AS model,
      item.description,
      (
        SELECT image.image_url
        FROM item_images AS image
        WHERE image.item_id = item.item_id
        ORDER BY image.display_order ASC
        LIMIT 1
      ) AS imageUrl,
      COALESCE((
        SELECT json_group_array(image_url)
        FROM (
          SELECT image.image_url AS image_url
          FROM item_images AS image
          WHERE image.item_id = item.item_id
          ORDER BY image.display_order ASC
        )
      ), '[]') AS imageUrls
    FROM items AS item
    LEFT JOIN categories AS category ON category.category_id = item.category_id
    LEFT JOIN users AS seller ON seller.user_id = item.seller_id
    WHERE item.item_id = @id AND item.status = 'active'
    LIMIT 1
  `).get({ id }) as (Omit<MarketplaceListingDetail, "routeId" | "source" | "imageUrls"> & { imageUrls: string }) | undefined;

  return row ? { ...row, imageUrls: JSON.parse(row.imageUrls) as string[], source: "jbay", routeId } : null;
}

/** Return the local owner identity for a marketplace listing without exposing it in public listing data. */
export function getMarketplaceListingSellerIdentity(routeId: string): { userId: string; auth0Sub: string | null } | null {
  const separator = routeId.indexOf("~");
  if (separator <= 0 || separator === routeId.length - 1 || routeId.slice(0, separator) !== "jbay") return null;
  const row = getDatabase().prepare(`
    SELECT item.seller_id AS userId, seller.auth0_sub AS auth0Sub
    FROM items AS item
    LEFT JOIN users AS seller ON seller.user_id = item.seller_id
    WHERE item.item_id = @id AND item.status = 'active'
    LIMIT 1
  `).get({ id: routeId.slice(separator + 1) }) as { userId: string; auth0Sub: string | null } | undefined;
  return row ?? null;
}
