This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Auth0 setup

The app uses Auth0 Universal Login with an email/password database connection.
Login and signup are pinned to that connection, so social providers are not
offered by this app.

1. In Auth0, create a **Regular Web Application** and enable an email/password
   database connection. Set the connection's login identifier to **Email** and
   choose the **Good** or **Excellent** password policy in its settings.
2. Copy `.env.example` to `.env.local` and fill in the tenant domain, client ID,
   and client secret. Generate `AUTH0_SECRET` with `openssl rand -hex 32`.
   Set `AUTH0_DB_CONNECTION` to the exact name of your database connection.
3. In the Auth0 app settings, add `http://localhost:3000/auth/callback` to
   **Allowed Callback URLs** and `http://localhost:3000` to **Allowed Logout
   URLs** and **Allowed Web Origins**.
4. Restart the app with `npm run dev`. The header provides sign-in, signup, and
   sign-out actions.

To require a unique username during signup, open Auth0 Dashboard →
Authentication → Database → `Username-Password-Authentication` and enable
**Requires Username**. Auth0 Universal Login adds the username field to signup
and enforces uniqueness in that database connection. The app syncs the username
claim to `users.username`, which also has a unique constraint in
`marketplace.db`.

After a successful login, the Auth0 callback upserts the user's Auth0 subject,
email, name, picture, email-verification flag, and login timestamps into the
`users` table in `../backend/databases/marketplace.db`. Auth0 identities map to
the database's app-owned `user_id` through a unique `auth0_sub`; the Auth0
password remains with Auth0. Seller listings are stored in `items`, and their
photo URLs are stored in `item_images`. Set `MARKETPLACE_DATABASE_PATH` if the
SQLite file is elsewhere. The separate `../backend/data/listing.db` contains
scraped price observations and is not used by the marketplace listing pages.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
