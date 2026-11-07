import { Auth0Client } from "@auth0/nextjs-auth0/server";

// The SDK requires these four values to initialize a Regular Web Application.
// Keep auth optional during local UI development when credentials are absent.
export const auth0Configured = Boolean(
  process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    process.env.AUTH0_SECRET,
);

export const auth0 = auth0Configured
  ? new Auth0Client({
      authorizationParameters: {
        scope: "openid profile email",
        connection: process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication",
      },
    })
  : null;
