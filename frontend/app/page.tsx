"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteFooter from "./components/footer";
import SiteNavbar from "./components/navbar";
import ListingCard from "./components/listing-card";
import type { MarketplaceListing } from "@/lib/listing-store";

const categories = [
  { name: "Phones", glyph: "📱" },
  { name: "Computers", glyph: "💻" },
  { name: "Audio", glyph: "🎧" },
];

export default function Home() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/listings", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load listings.");
        return response.json() as Promise<{ listings: MarketplaceListing[] }>;
      })
      .then((result) => setListings(result.listings.slice(0, 4)))
      .catch(() => {
        if (!controller.signal.aborted) setListings([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-5 text-ink-deep sm:px-8 lg:px-12">
      <header className="flex h-20 items-center justify-between border-b border-hairline-soft">
        <a className="flex items-center gap-2 text-xl font-bold tracking-tight" href="#top" aria-label="Forme home">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-on-primary">f.</span> forme
        </a>
        <nav className="hidden items-center gap-8 text-sm text-charcoal sm:flex" aria-label="Main navigation">
          <a className="font-semibold text-ink-deep" href="#discover">Discover</a>
          <a href="#how-it-works">How it works</a>
          <a href="/negotiate">Negotiate</a>
        </nav>
        <div className="flex items-center gap-2">
          <AuthActions />
          <a className="hidden rounded-full border-2 border-ink-deep px-5 py-3 text-sm font-bold md:inline-flex" href="#sell">Start selling</a>
        </div>
      </header>

          <div className="relative mx-auto w-full max-w-lg py-3 sm:py-8">
            <div className="absolute inset-5 rounded-3xl bg-primary/20 blur-3xl" aria-hidden="true" />
            <div className="relative rounded-3xl bg-surface-dark-elevated p-6 sm:p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-medium text-on-dark-soft">DISCOVER</p>
                  <p className="mt-1 text-lg font-semibold">Technology, in good hands</p>
                </div>
                <span className="grid size-10 place-items-center rounded-full bg-surface-strong text-xl" aria-hidden="true">⌘</span>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {categories.map((category) => (
                  <Link key={category.name} href="/marketplace" className="rounded-2xl bg-white/5 p-4 text-center transition-colors hover:bg-white/10">
                    <span className="text-3xl" aria-hidden="true">{category.glyph}</span>
                    <span className="mt-3 block text-xs text-on-dark-soft">{category.name}</span>
                  </Link>
                ))}
              </div>
              <Link href="/marketplace" className="mt-5 flex items-center justify-between rounded-2xl bg-canvas p-4 text-ink">
                <span>
                  <span className="block text-xs text-body">Fresh finds</span>
                  <span className="mt-1 block text-sm font-semibold">Browse the latest listings</span>
                </span>
                <span className="text-xl text-primary" aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="absolute -bottom-2 right-0 rounded-full bg-canvas px-4 py-2 text-sm font-medium text-ink shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
              Phones · Computers · Audio
            </div>
          </div>
        </section>
      </div>

      <section id="categories" className="bg-surface-soft px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">One focused collection</p>
            <h2 className="mt-3 text-3xl font-normal tracking-tight sm:text-4xl">Technology for its next chapter.</h2>
            <p className="mt-4 text-base leading-7 text-body">Explore pre-loved devices across the categories we support today.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {categories.map((category) => (
              <Link key={category.name} href="/marketplace" className="group flex items-center gap-5 rounded-3xl border border-hairline bg-canvas p-6 transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:p-8">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-strong text-2xl" aria-hidden="true">{category.glyph}</span>
                <span className="flex-1 text-lg font-semibold">{category.name}</span>
                <span className="text-xl text-primary transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-canvas px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-primary">Recently listed</p>
              <h2 className="mt-2 text-3xl font-normal tracking-tight sm:text-4xl">A few good finds.</h2>
            </div>
            <Link className="text-sm font-semibold text-primary" href="/marketplace">View all listings <span aria-hidden="true">→</span></Link>
          </div>
          {loading ? (
            <p className="py-16 text-center text-sm text-body">Loading the latest listings…</p>
          ) : listings.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {listings.map((listing) => <ListingCard key={listing.routeId} listing={listing} />)}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-hairline bg-surface-soft px-6 py-14 text-center">
              <p className="text-sm text-body">The latest listings will appear here.</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-primary" href="/marketplace">Go to the marketplace →</Link>
            </div>
          )}
        </div>
      </section>

      <section id="sell" className="bg-surface-dark px-5 py-16 text-center text-on-dark sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-on-dark-soft">For your next chapter</p>
          <h2 className="mt-3 text-4xl font-normal tracking-tight sm:text-5xl">Pass good tech along.</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-on-dark-soft">Have a device ready for a new owner? Get in touch and help it find its next home.</p>
          <Link className="mt-7 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary" href="/sell">Sell with us</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
