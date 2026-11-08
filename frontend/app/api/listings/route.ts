import { searchMarketplaceListings } from "@/lib/listing-store";
import {
  MARKETPLACE_CONDITIONS,
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
  const validConditions = new Set<string>(MARKETPLACE_CONDITIONS.map(({ value }) => value));

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

function parsePrice(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  return Number(value);
}
