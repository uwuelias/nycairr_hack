import Database from "better-sqlite3";
import { resolve } from "node:path";
import { MARKETPLACE_CATEGORIES } from "./marketplace-options";

type DatabaseGlobal = typeof globalThis & {
  jbayMarketplaceDatabase?: Database.Database;
};

const globalForDatabase = globalThis as DatabaseGlobal;

/** Open the canonical backend marketplace database and ensure its app schema is current. */
export function getMarketplaceDatabase(): Database.Database {
  if (globalForDatabase.jbayMarketplaceDatabase) {
    ensureMarketplaceSchema(globalForDatabase.jbayMarketplaceDatabase);
    return globalForDatabase.jbayMarketplaceDatabase;
  }

  const databasePath = resolve(
    process.cwd(),
    process.env.MARKETPLACE_DATABASE_PATH ?? "../backend/databases/marketplace.db",
  );
  const database = new Database(databasePath, { timeout: 5_000 });
  ensureMarketplaceSchema(database);
  database.pragma("foreign_keys = ON");
  globalForDatabase.jbayMarketplaceDatabase = database;
  return database;
}

function ensureMarketplaceSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      category_id TEXT PRIMARY KEY NOT NULL,
      category_name TEXT NOT NULL UNIQUE,
      parent_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY NOT NULL,
      auth0_sub TEXT UNIQUE,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      first_name TEXT,
      last_name TEXT,
      profile_picture TEXT,
      location TEXT,
      account_status TEXT NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'deleted')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS items (
      item_id TEXT PRIMARY KEY NOT NULL,
      seller_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      price NUMERIC NOT NULL CHECK (price >= 0),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      item_condition TEXT CHECK (
        item_condition IN ('new', 'like_new', 'good', 'fair', 'poor') OR item_condition IS NULL
      ),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS item_images (
      image_id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (item_id, display_order)
    );
  `);

  migrateUsersForAuth0(database);
  migrateItemConditions(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS items_status_created_idx ON items(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS items_seller_created_idx ON items(seller_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS item_images_item_order_idx ON item_images(item_id, display_order);
    CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
  `);

  const insertCategory = database.prepare(
    "INSERT OR IGNORE INTO categories (category_id, category_name) VALUES (?, ?)",
  );
  const seedCategories = database.transaction(() => {
    for (const [id, name] of MARKETPLACE_CATEGORIES) insertCategory.run(id, name);
  });
  seedCategories();
}

/** Ensure local usernames and emails remain unique while mapping Auth0 subjects. */
function migrateUsersForAuth0(database: Database.Database): void {
  const columns = database.pragma("table_info(users)") as { name: string }[];
  const hasAuth0Sub = columns.some(({ name }) => name === "auth0_sub");
  const uniqueIndexes = database.pragma("index_list(users)") as {
    name: string;
    unique: number;
  }[];
  const hasUniqueEmail = uniqueIndexes.some((index) => {
    if (!index.unique) return false;
    const safeIndexName = index.name.replaceAll('"', '""');
    const indexedColumns = database.pragma(`index_info("${safeIndexName}")`) as { name: string | null }[];
    return indexedColumns.length === 1 && indexedColumns[0].name === "email";
  });
  if (hasAuth0Sub && hasUniqueEmail) return;

  const auth0SubColumn = hasAuth0Sub ? "auth0_sub" : "NULL";

  database.pragma("foreign_keys = OFF");
  try {
    const migrate = database.transaction(() => {
      database.exec(`
        CREATE TABLE users_auth0_migration (
          user_id TEXT PRIMARY KEY NOT NULL,
          auth0_sub TEXT UNIQUE,
          username TEXT UNIQUE,
          email TEXT UNIQUE,
          password_hash TEXT,
          first_name TEXT,
          last_name TEXT,
          profile_picture TEXT,
          location TEXT,
          account_status TEXT NOT NULL DEFAULT 'active'
            CHECK (account_status IN ('active', 'suspended', 'deleted')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_auth0_migration (
          user_id, auth0_sub, username, email, password_hash, first_name, last_name,
          profile_picture, location, account_status, created_at
        )
        SELECT user_id, ${auth0SubColumn}, username, email, password_hash, first_name, last_name,
          profile_picture, location, account_status, created_at
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_auth0_migration RENAME TO users;
      `);
    });
    migrate();
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

/** Expand the old condition constraint while retaining existing marketplace items. */
function migrateItemConditions(database: Database.Database): void {
  const schema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
    .get() as { sql: string } | undefined;
  if (!schema || schema.sql.includes("'like_new'") && schema.sql.includes("'poor'")) return;

  database.pragma("foreign_keys = OFF");
  try {
    const migrate = database.transaction(() => {
      database.exec(`
        CREATE TABLE items_condition_migration (
          item_id TEXT PRIMARY KEY NOT NULL,
          seller_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
          category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT,
          price NUMERIC NOT NULL CHECK (price >= 0),
          quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
          item_condition TEXT CHECK (
            item_condition IN ('new', 'like_new', 'good', 'fair', 'poor') OR item_condition IS NULL
          ),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'inactive')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO items_condition_migration (
          item_id, seller_id, category_id, title, description, price, quantity,
          item_condition, status, created_at, updated_at
        )
        SELECT item_id, seller_id, category_id, title, description, price, quantity,
          CASE item_condition
            WHEN 'used' THEN 'good'
            WHEN 'refurbished' THEN 'like_new'
            ELSE item_condition
          END,
          status, created_at, updated_at
        FROM items;
        DROP TABLE items;
        ALTER TABLE items_condition_migration RENAME TO items;
      `);
    });
    migrate();
  } finally {
    database.pragma("foreign_keys = ON");
  }
}
