import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

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
      onCallback: async (error, context, session) => {
        if (error) {
          return new NextResponse("Authentication failed.", { status: 500 });
        }

        if (session?.user) {
          const { getAuth0Username, getProfileUsername, syncAuth0User } = await import("./sync-auth0-user");
          const profileUsername = getProfileUsername(session.user);
          const auth0Username = profileUsername ?? await getAuth0Username(session.user.sub);
          syncAuth0User(session.user, auth0Username);
        }

        const appBaseUrl = context.appBaseUrl ?? process.env.APP_BASE_URL;
        if (!appBaseUrl) {
          return new NextResponse("Application base URL is not configured.", {
            status: 500,
          });
        }

        const baseUrl = new URL(appBaseUrl);
        const destination = new URL(context.returnTo ?? "/", baseUrl);
        if (destination.origin !== baseUrl.origin) {
          return NextResponse.redirect(baseUrl);
        }

        return NextResponse.redirect(destination);
      },
    })
  : null;
