import { auth0 } from "@/lib/auth0";
import { getSellerInboxSessions, type SellerInboxSession } from "@/lib/negotiation-inbox";
import { syncAuth0User } from "@/lib/sync-auth0-user";

function backendUrl(sessionId: string) {
  const backendBase = (
    process.env.NEGOTIATION_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:5000"
  ).replace(/\/+$/, "");
  return `${backendBase}/api/sessions/${encodeURIComponent(sessionId)}`;
}

export async function GET() {
  const session = await auth0?.getSession();
  if (!session?.user.sub) {
    return Response.json({ error: "Sign in to view seller chats." }, { status: 401 });
  }

  let inboxSessions: SellerInboxSession[];
  try {
    const sellerId = syncAuth0User(session.user);
    inboxSessions = getSellerInboxSessions(sellerId);
  } catch (error) {
    console.error("Unable to load seller negotiation inbox:", error);
    return Response.json({ error: "Seller chats are temporarily unavailable." }, { status: 500 });
  }

  const chats = await Promise.all(inboxSessions.map(async (entry) => {
    try {
      const response = await fetch(backendUrl(entry.sessionId), {
        headers: { "X-Session-Token": entry.sellerToken },
        cache: "no-store",
      });
      if (!response.ok) return null;
      const data = await response.json();
      const latest = data.messages?.at(-1);
      return {
        id: entry.sessionId,
        role: "seller" as const,
        token: entry.sellerToken,
        title: data.item?.listing_title || entry.listingTitle,
        status: data.status,
        preview: latest?.text ?? "No messages yet",
      };
    } catch {
      return null;
    }
  }));

  return Response.json(
    { chats: chats.filter((chat) => chat !== null) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
