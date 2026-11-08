import { getMarketplaceDatabase } from "./marketplace-database";

export type SellerInboxSession = {
  sessionId: string;
  sellerToken: string;
  listingTitle: string;
};

export function saveSellerInboxSession(session: SellerInboxSession & { sellerId: string }): void {
  getMarketplaceDatabase().prepare(`
    INSERT OR IGNORE INTO listing_negotiation_inbox (session_id, seller_id, seller_token, listing_title)
    VALUES (@sessionId, @sellerId, @sellerToken, @listingTitle)
  `).run(session);
}

export function getSellerInboxSessions(sellerId: string): SellerInboxSession[] {
  return getMarketplaceDatabase().prepare(`
    SELECT session_id AS sessionId, seller_token AS sellerToken, listing_title AS listingTitle
    FROM listing_negotiation_inbox
    WHERE seller_id = @sellerId
    ORDER BY created_at DESC
  `).all({ sellerId }) as SellerInboxSession[];
}
