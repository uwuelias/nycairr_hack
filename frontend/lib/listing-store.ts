import Database from "better-sqlite3";
import { resolve } from "node:path";

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

/** Search active asking listings, returning at most 30 newest results. */
export function searchMarketplaceListings(search = ""): MarketplaceListing[] {
  const query = search.trim();
  const database = getDatabase();

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
        model
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
      ORDER BY listedDate DESC, fetchedAt DESC, id ASC
      LIMIT 30
    `)
    .all({ query }) as Omit<MarketplaceListing, "routeId">[];

  return rows.map((listing) => ({
    ...listing,
    routeId: `${listing.source}~${listing.id}`,
  }));
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
