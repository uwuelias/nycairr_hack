import { randomUUID } from "node:crypto";
import type { User } from "@auth0/nextjs-auth0/types";
import { getMarketplaceDatabase } from "./marketplace-database";

/** Upsert an Auth0 profile and return its stable internal marketplace user id. */
export function syncAuth0User(user: User): string {
  if (!user.sub) {
    throw new Error("Cannot sync an Auth0 user without a subject identifier.");
  }

  const now = new Date().toISOString();

  const database = getMarketplaceDatabase();
  database
    .prepare(`
      INSERT INTO users (
        id,
        auth0_sub,
        email,
        name,
        picture,
        email_verified,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (
        @id,
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
      id: randomUUID(),
      auth0Sub: user.sub,
      email: user.email ?? null,
      name: user.name ?? null,
      picture: user.picture ?? null,
      emailVerified: Number(user.email_verified ?? false),
      now,
    });

  const row = database
    .prepare("SELECT id FROM users WHERE auth0_sub = ?")
    .get(user.sub) as { id: string } | undefined;

  if (!row) {
    throw new Error("Auth0 user sync completed without a marketplace user record.");
  }

  return row.id;
}
