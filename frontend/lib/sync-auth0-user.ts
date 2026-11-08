import Database from "better-sqlite3";
import { resolve } from "node:path";
import type { User } from "@auth0/nextjs-auth0/types";

type DatabaseGlobal = typeof globalThis & {
  auth0UserDatabase?: Database.Database;
};

const globalForDatabase = globalThis as DatabaseGlobal;

function getDatabase() {
  if (globalForDatabase.auth0UserDatabase) {
    return globalForDatabase.auth0UserDatabase;
  }

  const databasePath = resolve(
    process.cwd(),
    process.env.APP_DATABASE_PATH ?? "../backend/data/listing.db",
  );
  const database = new Database(databasePath, { timeout: 5_000 });

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      auth0_sub TEXT PRIMARY KEY NOT NULL,
      email TEXT,
      name TEXT,
      picture TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    )
  `);

  globalForDatabase.auth0UserDatabase = database;
  return database;
}

/** Upsert the minimum Auth0 profile data needed by the application. */
export function syncAuth0User(user: User): void {
  if (!user.sub) {
    throw new Error("Cannot sync an Auth0 user without a subject identifier.");
  }

  const now = new Date().toISOString();

  getDatabase()
    .prepare(`
      INSERT INTO app_users (
        auth0_sub,
        email,
        name,
        picture,
        email_verified,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (
        @auth0Sub,
        @email,
        @name,
        @picture,
        @emailVerified,
        @now,
        @now,
        @now
      )
      ON CONFLICT(auth0_sub) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        email_verified = excluded.email_verified,
        updated_at = excluded.updated_at,
        last_login_at = excluded.last_login_at
    `)
    .run({
      auth0Sub: user.sub,
      email: user.email ?? null,
      name: user.name ?? null,
      picture: user.picture ?? null,
      emailVerified: Number(user.email_verified ?? false),
      now,
    });
}
