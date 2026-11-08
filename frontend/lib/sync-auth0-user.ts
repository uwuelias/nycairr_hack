import { randomUUID } from "node:crypto";
import type { User } from "@auth0/nextjs-auth0/types";
import { getMarketplaceDatabase } from "./marketplace-database";

/** Upsert the Auth0 profile in marketplace.db and return its local seller id. */
export function syncAuth0User(user: User): string {
  if (!user.sub) {
    throw new Error("Cannot sync an Auth0 user without a subject identifier.");
  }

  const name = user.name?.trim() || user.nickname?.trim() || null;
  const nameParts = name?.split(/\s+/, 2) ?? [];
  const profileUsername = typeof user.username === "string" && user.username.trim()
    ? user.username.trim()
    : null;
  const database = getMarketplaceDatabase();

  database.prepare(`
    INSERT INTO users (
      user_id, auth0_sub, username, email, password_hash,
      first_name, last_name, profile_picture, account_status, created_at
    ) VALUES (
      @userId, @auth0Sub, @username, @email, NULL,
      @firstName, @lastName, @picture, 'active', @createdAt
    )
    ON CONFLICT(auth0_sub) DO UPDATE SET
      username = CASE
        WHEN @profileUsername IS NULL THEN users.username
        ELSE excluded.username
      END,
      email = COALESCE(excluded.email, users.email),
      first_name = COALESCE(excluded.first_name, users.first_name),
      last_name = COALESCE(excluded.last_name, users.last_name),
      profile_picture = COALESCE(excluded.profile_picture, users.profile_picture)
  `).run({
    userId: randomUUID(),
    auth0Sub: user.sub,
    username: profileUsername ?? `auth0:${user.sub}`,
    profileUsername,
    email: user.email ?? null,
    firstName: user.given_name ?? nameParts[0] ?? null,
    lastName: user.family_name ?? nameParts[1] ?? null,
    picture: user.picture ?? null,
    createdAt: new Date().toISOString(),
  });

  const row = database.prepare("SELECT user_id FROM users WHERE auth0_sub = ?").get(user.sub) as
    | { user_id: string }
    | undefined;
  if (!row) throw new Error("Auth0 user sync completed without a marketplace user record.");
  return row.user_id;
}
