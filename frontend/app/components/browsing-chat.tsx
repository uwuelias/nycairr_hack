"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  listings?: ListingResult[];
};

type ListingResult = { routeId: string; title: string; price: number; imageUrl: string | null; category: string };
type PriceReport = {
  query: { brand: string; model: string; condition: string };
  p50: number | null;
  n_sold: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  basis: string;
  caveats: string[];
};

export type BrowsingChatListing = ListingResult & {
  description: string | null;
  category: string;
  condition: string | null;
};

export default function BrowsingChat({ currentListing }: { currentListing?: BrowsingChatListing }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: currentListing
      ? `Hi! I see you’re viewing ${currentListing.title}. Ask me about this item or tell me what you’re comparing it with.`
      : "Hi! Tell me what kind of tech you’re looking for." },
  ]);
  const [draft, setDraft] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [...current, { role: "user", text }]);
    setDraft("");
    setIsSearching(true);
    try {
      const asksAboutPrice = Boolean(currentListing && /\b(price|priced|cost|deal|worth|overpriced|underpriced|expensive|cheap)\b/i.test(text));
      const searchQuery = asksAboutPrice
        ? currentListing.category.replaceAll("_", " ") || currentListing.title
        : text;
      const response = await fetch(`/api/listings?q=${encodeURIComponent(searchQuery)}&sort=newest`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      const searchListings = data.listings as ListingResult[];
      const otherListings = currentListing
        ? searchListings.filter((listing) =>
            listing.routeId !== currentListing.routeId &&
            (!asksAboutPrice || listing.category === currentListing.category),
          )
        : searchListings;
      const listings = currentListing
        ? [currentListing, ...otherListings]
        : searchListings;
      let priceAssessment = "I couldn’t get a fair-price estimate right now. Please try again.";
      if (asksAboutPrice && currentListing) {
        try {
          const pricingResponse = await fetch("/api/negotiation/research/price-for-listing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: currentListing.title,
              category: currentListing.category,
              condition: currentListing.condition,
            }),
          });
          const reportData = await pricingResponse.json();
          if (pricingResponse.ok) {
            const report = reportData as PriceReport;
            if (report.p50 === null) {
              priceAssessment = `I matched this listing to ${report.query.brand} ${report.query.model}, but your pricing.py research found only ${report.n_sold} sold listings in this condition, so it can’t provide a reliable fair price. Confidence: insufficient.`;
            } else {
              const difference = currentListing.price - report.p50;
              const comparison = difference > report.p50 * 0.1
                ? `The listing is $${difference.toFixed(2)} above that estimate.`
                : difference < -report.p50 * 0.1
                  ? `The listing is $${Math.abs(difference).toFixed(2)} below that estimate.`
                  : "The listing is close to that estimate.";
              priceAssessment = `Your pricing research estimates ${report.query.brand} ${report.query.model} in ${report.query.condition.replaceAll("_", " ")} condition at $${report.p50.toFixed(2)}. It’s the mean sold price from ${report.n_sold} sales (${report.basis}); confidence is ${report.confidence}. The asking price is $${currentListing.price.toFixed(2)}. ${comparison}${report.caveats.length ? ` Caveat: ${report.caveats.join("; ")}.` : ""}`;
            }
          } else {
            priceAssessment = reportData.error === "This listing title does not match a researched brand and model."
              ? "I couldn’t match this listing to a brand and model in the pricing research catalog, so I can’t give a model-specific fair price yet."
              : reportData.error ?? priceAssessment;
          }
        } catch {
          // Keep the listing search results useful when the research backend is offline.
        }
      }
      setMessages((current) => [...current, {
        role: "assistant",
        text: asksAboutPrice
          ? `${priceAssessment} I’ve included the item you’re viewing first, followed by other active listings in the same category. The fair-price estimate uses sold listings for the same researched model and condition.`
          : currentListing
          ? `You’re viewing ${currentListing.title}${currentListing.category ? ` in ${currentListing.category.replaceAll("_", " ")}` : ""} at $${currentListing.price.toFixed(2)}. I’ll keep this item in view as my recommendation${otherListings.length ? ` and found ${otherListings.length} other listing${otherListings.length === 1 ? "" : "s"} to compare` : ""}.${currentListing.condition ? ` It’s listed as ${currentListing.condition.replaceAll("_", " ")}.` : ""}${currentListing.description?.trim() ? ` The seller describes it as: ${currentListing.description.trim().slice(0, 240)}${currentListing.description.trim().length > 240 ? "…" : ""}` : ""}`
          : listings.length
            ? `I found ${listings.length} listing${listings.length === 1 ? "" : "s"} that may match.`
            : "I couldn’t find matching listings. Try a brand or model name, like “iPhone 13”.",
        listings,
      }]);
    } catch {
      setMessages((current) => [...current, {
        role: "assistant",
        text: "I couldn’t search listings right now. Please try again.",
      }]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <aside className="fixed bottom-5 right-5 z-50 flex flex-col items-end sm:bottom-6 sm:right-6" aria-label="JBay browsing chat">
      {isOpen && (
        <section className="mb-3 flex h-[min(32rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-hairline bg-canvas shadow-[0_16px_48px_rgba(0,0,0,0.2)]" aria-labelledby="browsing-chat-title">
          <header className="flex items-start justify-between border-b border-hairline px-5 py-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary">JBay ASSISTANT</p>
              <h2 id="browsing-chat-title" className="mt-1 text-lg font-semibold tracking-tight">{currentListing ? "Ask about this item" : "Find the right tech"}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-body">{currentListing ? `Viewing: ${currentListing.title}` : "Tell us what you’re looking for."}</p>
            </div>
            <button
              aria-label="Minimize chat"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-strong text-lg text-ink hover:bg-surface-soft"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite" aria-label="Chat messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`max-w-[95%] ${message.role === "user" ? "ml-auto" : "mr-auto"}`}>
                <p className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-primary text-on-primary" : "bg-surface-strong text-ink"}`}>
                  {message.text}
                </p>
                {message.listings?.map((listing) => (
                  <a key={listing.routeId} href={`/marketplace/${encodeURIComponent(listing.routeId)}`} className="mt-2 flex items-center gap-3 rounded-2xl border border-hairline bg-canvas p-2 text-ink hover:border-primary">
                    {listing.imageUrl ? <Image src={listing.imageUrl} alt="" width={48} height={48} unoptimized className="size-12 rounded-xl object-cover" /> : <span className="grid size-12 place-items-center rounded-xl bg-surface-soft" aria-hidden="true">⌘</span>}
                    <span className="min-w-0"><span className="block line-clamp-2 text-xs font-semibold">{listing.title}</span><span className="mt-1 block text-xs text-body">${listing.price.toFixed(2)}</span></span>
                  </a>
                ))}
              </div>
            ))}
            {isSearching && <p className="mr-auto rounded-2xl bg-surface-strong px-4 py-3 text-sm text-body">Searching listings…</p>}
          </div>

          <form className="flex gap-2 border-t border-hairline p-3" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="browsing-chat-input">Message the JBay assistant</label>
            <input
              id="browsing-chat-input"
              className="h-11 min-w-0 flex-1 rounded-full border border-hairline bg-canvas px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={currentListing ? "Ask about this listing or compare it…" : "What are you looking for?"}
              value={draft}
            />
            <button className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!draft.trim() || isSearching} type="submit">
              Send
            </button>
          </form>
        </section>
      )}

      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close browsing chat" : "Open browsing chat"}
        className="flex h-14 items-center gap-3 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8 11h8M8 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Browse with JBay
      </button>
    </aside>
  );
}
