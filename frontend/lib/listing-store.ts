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
};

export type MarketplaceListingDetail = MarketplaceListing & {
  description: string | null;
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
    process.env.APP_DATABASE_PATH ?? "../backend/data/listing.db",
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

/** Search active asking listings in pages of 30 newest results. */
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
    ? `AND condition IN (${selectedConditions.map((_, index) => `@condition${index}`).join(", ")})`
    : "";
  const sortOrder = {
    newest: "listedDate DESC, fetchedAt DESC, id ASC",
    price_low_high: "price ASC, listedDate DESC, fetchedAt DESC, id ASC",
    price_high_low: "price DESC, listedDate DESC, fetchedAt DESC, id ASC",
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

  const rows = database
    .prepare(`
      WITH latest_observations AS (
        SELECT
          listing.source_item_id AS id,
          listing.source,
          listing.title,
          listing.price,
          listing.price_type AS priceType,
          listing.category,
          listing.condition,
          listing.listed_date AS listedDate,
          listing.fetched_at AS fetchedAt,
          listing.brand,
          listing.model,
          ROW_NUMBER() OVER (
            PARTITION BY listing.source, listing.source_item_id
            ORDER BY listing.fetched_at DESC, listing.id DESC
          ) AS observationRank
        FROM price_observations AS listing
      )
      SELECT
        id,
        source,
        title,
        price,
        category,
        condition,
        listedDate,
        brand,
        model,
        COUNT(*) OVER () AS totalCount
      FROM latest_observations
      WHERE observationRank = 1
        AND priceType = 'asking'
        AND (
          @query = '' OR
          instr(lower(title), lower(@query)) > 0 OR
          instr(lower(category), lower(@query)) > 0 OR
          instr(lower(COALESCE(brand, '')), lower(@query)) > 0 OR
          instr(lower(COALESCE(model, '')), lower(@query)) > 0
        )
        AND (@minPrice IS NULL OR price >= @minPrice)
        AND (@maxPrice IS NULL OR price <= @maxPrice)
        ${conditionFilter}
      ORDER BY ${sortOrder}
      LIMIT @limit OFFSET @offset
    `)
    .all(bindings) as (Omit<MarketplaceListing, "routeId"> & { totalCount: number })[];

  const hasNextPage = rows.length > MARKETPLACE_PAGE_SIZE;
  const totalCount = rows[0]?.totalCount ?? 0;
  const listings = rows.slice(0, MARKETPLACE_PAGE_SIZE).map((listing) => ({
    id: listing.id,
    routeId: `${listing.source}~${listing.id}`,
    source: listing.source,
    title: listing.title,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    listedDate: listing.listedDate,
    brand: listing.brand,
    model: listing.model,
  }));

  return {
    listings,
    hasNextPage,
    totalPages: Math.ceil(totalCount / MARKETPLACE_PAGE_SIZE),
  };
}

/** Find the latest asking observation for one source item. */
export function getMarketplaceListingByRouteId(
  routeId: string,
): MarketplaceListingDetail | null {
  const separator = routeId.indexOf("~");
  if (separator <= 0 || separator === routeId.length - 1) return null;

  const source = routeId.slice(0, separator);
  const id = routeId.slice(separator + 1);
  const database = getDatabase();
  const columns = database.pragma("table_info(price_observations)") as {
    name: string;
  }[];
  const descriptionColumn = columns.some((column) => column.name === "description")
    ? "listing.description"
    : "NULL";

  const row = database
    .prepare(`
      WITH latest_observations AS (
        SELECT
          listing.source_item_id AS id,
          listing.source,
          listing.title,
          listing.price,
          listing.price_type AS priceType,
          listing.category,
          listing.condition,
          listing.listed_date AS listedDate,
          listing.fetched_at AS fetchedAt,
          listing.brand,
          listing.model,
          ${descriptionColumn} AS description,
          ROW_NUMBER() OVER (
            PARTITION BY listing.source, listing.source_item_id
            ORDER BY listing.fetched_at DESC, listing.id DESC
          ) AS observationRank
        FROM price_observations AS listing
      )
      SELECT id, source, title, price, category, condition, listedDate,
        brand, model, description
      FROM latest_observations
      WHERE observationRank = 1
        AND priceType = 'asking'
        AND source = @source
        AND id = @id
      LIMIT 1
    `)
    .get({ source, id }) as Omit<MarketplaceListingDetail, "routeId"> | undefined;

  if (!row) return null;

  return {
    ...row,
    routeId,
  };
}
