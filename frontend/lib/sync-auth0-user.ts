import { randomUUID } from "node:crypto";
import type { User } from "@auth0/nextjs-auth0/types";
import { getMarketplaceDatabase } from "./marketplace-database";

/** Read the username from standard or Auth0 Action-added session claims. */
export function getProfileUsername(user: User): string | null {
  const configuredClaim = process.env.AUTH0_USERNAME_CLAIM;
  const customUsernameClaim = Object.entries(user).find(
    ([key, value]) => /(?:^|[/:_])(?:preferred_)?username$/i.test(key) &&
      key.includes("://") && typeof value === "string" && Boolean(value.trim()),
  )?.[1];
  const candidates = [
    user.username,
    configuredClaim ? user[configuredClaim] : null,
    customUsernameClaim,
    user.preferred_username,
  ];
  return candidates.find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  )?.trim() ?? null;
}

/** Read the database-connection username when Auth0's login profile omits it. */
export async function getAuth0Username(auth0Sub: string): Promise<string | null> {
  const domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) return null;

  const issuer = `https://${domain}`;
  const audience = process.env.AUTH0_MANAGEMENT_AUDIENCE || `${issuer}/api/v2/`;

  try {
    const tokenResponse = await fetch(`${issuer}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        audience,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!tokenResponse.ok) return null;
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) return null;

    const userResponse = await fetch(
      `${issuer}/api/v2/users/${encodeURIComponent(auth0Sub)}?fields=username&include_fields=true`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!userResponse.ok) return null;
    const profile = await userResponse.json() as { username?: unknown };
    return typeof profile.username === "string" && profile.username.trim()
      ? profile.username.trim()
      : null;
  } catch {
    return null;
  }
}

/** Upsert the Auth0 profile in marketplace.db and return its local seller id. */
export function syncAuth0User(user: User, auth0Username?: string | null): string {
  if (!user.sub) {
    throw new Error("Cannot sync an Auth0 user without a subject identifier.");
  }

  const name = user.name?.trim() || user.nickname?.trim() || null;
  const nameParts = name?.split(/\s+/, 2) ?? [];
  const profileUsername = auth0Username?.trim() || getProfileUsername(user);
  const database = getMarketplaceDatabase();

  // Preserve ownership of older local listings when the owner signs in with
  // the same verified email address they used before Auth0 was connected.
  if (user.email && user.email_verified) {
    const existing = database.prepare(`
      SELECT user_id
      FROM users
      WHERE lower(email) = lower(?) AND (auth0_sub IS NULL OR auth0_sub = ?)
      LIMIT 1
    `).get(user.email, user.sub) as { user_id: string } | undefined;
    if (existing) {
      database.prepare(`
        UPDATE users
        SET auth0_sub = ?,
            email = COALESCE(?, email),
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            profile_picture = COALESCE(?, profile_picture)
        WHERE user_id = ?
      `).run(
        user.sub,
        user.email,
        user.given_name ?? nameParts[0] ?? null,
        user.family_name ?? nameParts[1] ?? null,
        user.picture ?? null,
        existing.user_id,
      );
      return existing.user_id;
    }
  }

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
        WHEN @profileUsername IS NOT NULL THEN excluded.username
        WHEN users.username LIKE 'auth0:%' THEN NULL
        WHEN users.email IS NOT NULL
          AND instr(users.email, '@') > 1
          AND lower(users.username) = lower(substr(users.email, 1, instr(users.email, '@') - 1)) THEN NULL
        ELSE users.username
      END,
      email = COALESCE(excluded.email, users.email),
      first_name = COALESCE(excluded.first_name, users.first_name),
      last_name = COALESCE(excluded.last_name, users.last_name),
      profile_picture = COALESCE(excluded.profile_picture, users.profile_picture)
  `).run({
    userId: randomUUID(),
    auth0Sub: user.sub,
    username: profileUsername,
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
