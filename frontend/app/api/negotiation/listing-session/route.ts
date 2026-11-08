import { getMarketplaceListingByRouteId, getMarketplaceListingSellerIdentity } from "@/lib/listing-store";
import { saveSellerInboxSession } from "@/lib/negotiation-inbox";

function backendUrl(path: string) {
  const backendBase = (
    process.env.NEGOTIATION_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:5000"
  ).replace(/\/+$/, "");
  return new URL(path, backendBase);
}

export async function POST(request: Request) {
  if (!request.headers.get("origin") || request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "This request could not be verified." }, { status: 403 });
  }

  let payload: { listingId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "A listing ID is required." }, { status: 400 });
  }
  if (typeof payload.listingId !== "string" || payload.listingId.length > 160) {
    return Response.json({ error: "A valid listing ID is required." }, { status: 400 });
  }

  const listing = getMarketplaceListingByRouteId(payload.listingId);
  const seller = getMarketplaceListingSellerIdentity(payload.listingId);
  if (!listing || !seller) {
    return Response.json({ error: "This listing is no longer available." }, { status: 404 });
  }

  const fallbackWords = listing.title.trim().split(/\s+/);
  let query = {
    category: listing.category || "peripherals",
    brand: listing.brand || fallbackWords[0] || "Unknown",
    model: listing.model || fallbackWords.slice(1).join(" ") || listing.title,
    condition: listing.condition || "good",
  };

  try {
    const researchResponse = await fetch(backendUrl("/api/research/price-for-listing"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: listing.title,
        category: listing.category,
        condition: listing.condition,
      }),
      cache: "no-store",
    });
    if (researchResponse.ok) {
      const report = await researchResponse.json() as { query?: typeof query };
      if (report.query) query = report.query;
    }
  } catch {
    // An unindexed item can still start a chat without a market price anchor.
  }

  let created: { session_id: string; buyer_token: string; seller_token: string };
  try {
    const createResponse = await fetch(backendUrl("/api/sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, listing_title: listing.title }),
      cache: "no-store",
    });
    const data = await createResponse.json();
    if (!createResponse.ok) {
      return Response.json({ error: data.error ?? "The chat could not be started." }, { status: createResponse.status });
    }
    created = data as typeof created;
  } catch {
    return Response.json({ error: "The negotiation service is unavailable. Please try again." }, { status: 502 });
  }

  try {
    // Keep the chat attached to the listing owner even if they have not linked
    // their Auth0 identity yet. A verified-email account link can then expose it.
    saveSellerInboxSession({
      sessionId: created.session_id,
      sellerId: seller.userId,
      sellerToken: created.seller_token,
      listingTitle: listing.title,
    });
  } catch {
    return Response.json({ error: "The seller inbox could not be updated. Please try again." }, { status: 500 });
  }

  return Response.json({
    session_id: created.session_id,
    buyer_token: created.buyer_token,
    seller_invite_token: seller.auth0Sub ? null : created.seller_token,
    title: listing.title,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
