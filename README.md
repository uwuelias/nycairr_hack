# FairMarket AI

FairMarket AI is a marketplace for buying and selling pre-loved technology. It combines searchable listings with sales-based price research and a private buyer/seller negotiation flow. Sellers can sign in, publish a listing with photos, and buyers can browse and contact a seller to negotiate.

## Features

- Browse and search listings, filter by condition and price, and sort results.
- Create an account and sign in with Auth0 Universal Login.
- Publish a listing with up to eight JPG, PNG, or WebP photos.
- Research prices from the bundled sold-listing observations in `backend/data/listing.db`.
- Start a negotiation with private buyer and seller price limits, chat, and optional negotiating agents.
- View the listing-image evaluation dashboard and review records when signed in.

## Project layout

```text
frontend/                 Next.js marketplace and server routes
backend/api/app.py        Flask pricing, negotiation, and evaluation API
backend/data/listing.db   Price research observations
backend/databases/        Marketplace SQLite database and uploaded listing photos
backend/agents/           Pricing, negotiation, and vision workflows
backend/services/         Image, claim, OCR, and photo validation helpers
```

The marketplace and pricing data use separate SQLite databases: the marketplace uses `backend/databases/marketplace.db`; price research reads `backend/data/listing.db`.

## Requirements

- Node.js and npm
- Python 3.10 or newer
- Auth0 account and application for sign-in and listing creation

## Run locally

Open two terminals from the repository root.

### 1. Start the backend API

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m api.app
```

The API runs at `http://localhost:5000`. Check it with:

```bash
curl http://localhost:5000/api/health
```

### 2. Configure and start the frontend

In a second terminal:

```bash
cd frontend
npm ci
cp .env.example .env.local
```

Fill in the Auth0 values in `frontend/.env.local`, then start Next.js:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The frontend expects the backend at `http://127.0.0.1:5000` by default. Set `NEGOTIATION_API_URL` in `frontend/.env.local` to change it. Set `FRONTEND_ORIGIN` in the backend environment if the frontend uses a different origin.

## Auth0 setup

Create an Auth0 **Regular Web Application** with an email/password database connection. In its settings, allow these local URLs:

- Callback: `http://localhost:3000/auth/callback`
- Logout: `http://localhost:3000`
- Web origin: `http://localhost:3000`

Set these required values in `frontend/.env.local`:

```dotenv
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_SECRET=replace-with-a-unique-secret
APP_BASE_URL=http://localhost:3000
AUTH0_DB_CONNECTION=Username-Password-Authentication
```

Generate a secret with `openssl rand -hex 32`. Use the exact name of your Auth0 database connection for `AUTH0_DB_CONNECTION`. The optional `AUTH0_USERNAME_CLAIM` can identify a custom username claim; optional Management API credentials (`AUTH0_MANAGEMENT_CLIENT_ID` and `AUTH0_MANAGEMENT_CLIENT_SECRET`) let the callback retrieve a username if it is missing from the login profile. See `frontend/README.md` for the full Auth0 username and Management API configuration notes.

Browsing does not require Auth0. Signing in is required to create listings and view evaluation data. Auth0 credentials must remain server-side; do not prefix them with `NEXT_PUBLIC_`.

## Data and uploads

The frontend creates or migrates the marketplace schema in `backend/databases/marketplace.db` when the database is opened. Auth0 users are mapped to app-owned user IDs, and listing records and photo URLs are stored there. Uploaded images default to `backend/databases/uploads/listings/`.

Optional path overrides, set in `frontend/.env.local`:

```dotenv
MARKETPLACE_DATABASE_PATH=../backend/databases/marketplace.db
APP_UPLOAD_DIRECTORY=../backend/databases/uploads/listings
```

The bundled `backend/data/listing.db` contains sold-price observations used by the research API. Research reports include the sample count, confidence, time window, condition averages, and caveats; estimates may be unavailable when there are too few matching sales.

## Useful commands

Run from `frontend/`:

```bash
npm run dev       # development server
npm run build     # production build
npm run start     # serve a production build
npm run lint      # ESLint
```

Run backend tests from `backend/`:

```bash
source .venv/bin/activate
python -m pytest
```

## API overview

The Flask service provides:

- `GET /api/health`
- `POST /api/research/price` and `POST /api/research/price-for-listing`
- `POST /api/sessions` to create a negotiation; session routes support chat, private limits, agent settings, and approval
- `GET /api/evaluation/summary`, `/api/evaluation/runs`, and `/api/evaluation/reviews`

The Next.js app proxies negotiation and evaluation requests to this service. Marketplace listing routes read and write directly to the marketplace SQLite database.

## Credits

The iPhone 13 Pro 3D model is by DatSketch on [Sketchfab](https://sketchfab.com/3d-models/iphone-13-pro-0c34a039d50e42f4b46738ec26929c15), used without modification under the [Creative Commons Attribution 4.0 license](https://creativecommons.org/licenses/by/4.0/).
