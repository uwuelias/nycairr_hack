"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ListingCard from "./components/listing-card";
import SiteFooter from "./components/footer";
import SiteNavbar from "./components/navbar";
import type { MarketplaceListing } from "@/lib/listing-store";

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
    <main className="min-h-screen bg-canvas text-ink">
      <SiteNavbar />

      <section className="bg-surface-dark px-5 py-20 text-on-dark sm:px-8 sm:py-24 lg:px-12 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-body-muted">A marketplace for better tech</p>
            <h1 className="mt-4 max-w-xl text-4xl font-normal leading-tight tracking-tight sm:text-[64px] lg:text-[80px] lg:leading-none lg:tracking-[-2px]">
              Good technology deserves another life.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-body-muted">
              Find quality pre-loved technology or pass along a device that is ready for its next owner.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="inline-flex h-14 items-center rounded-full bg-primary px-8 text-base font-semibold text-on-primary" href="/marketplace">
                Browse marketplace
              </Link>
              <Link className="inline-flex h-14 items-center rounded-full border border-white/20 px-8 text-base font-semibold text-on-dark" href="/sell">
                Sell an item
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-surface-dark-elevated p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-semibold tracking-wide text-body-muted">JBay marketplace</p>
                <p className="mt-1 text-lg font-semibold">Find your next favorite</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-surface-strong text-xl text-ink" aria-hidden="true">⌘</span>
            </div>
            <div className="mt-2 divide-y divide-white/10">
              {[
                ["Phones", "📱"],
                ["Computers", "💻"],
                ["Audio", "🎧"],
              ].map(([category, glyph]) => (
                <Link key={category} className="flex items-center gap-4 py-4 text-sm font-medium text-on-dark" href="/marketplace">
                  <span className="grid size-9 place-items-center rounded-full bg-white/5" aria-hidden="true">{glyph}</span>
                  <span className="flex-1">{category}</span>
                  <span className="text-body-muted" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
            <Link className="mt-3 flex items-center justify-between rounded-2xl bg-canvas p-4 text-ink" href="/marketplace">
              <span>
                <span className="block text-xs text-body">Fresh finds</span>
                <span className="mt-1 block text-sm font-semibold">Browse the latest listings</span>
              </span>
              <span className="text-xl text-primary" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-canvas px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold text-primary">Recently listed</p>
              <h2 className="mt-2 text-3xl font-normal tracking-tight sm:text-4xl">A few good finds.</h2>
            </div>
            <Link className="text-sm font-semibold text-primary" href="/marketplace">
              View all listings <span aria-hidden="true">→</span>
            </Link>
          </div>

          {loading ? (
            <p className="py-16 text-center text-sm text-body">Loading the latest listings…</p>
          ) : listings.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {listings.map((listing) => <ListingCard key={listing.routeId} listing={listing} />)}
            </div>
          ) : (
            <div className="mt-8 rounded-3xl border border-hairline bg-canvas px-6 py-14 text-center">
              <p className="text-sm text-body">The latest listings will appear here.</p>
              <Link className="mt-4 inline-flex text-sm font-semibold text-primary" href="/marketplace">
                Go to the marketplace →
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface-soft px-5 py-20 text-center sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-muted">Ready for a new chapter?</p>
          <h2 className="mt-3 text-3xl font-normal tracking-tight sm:text-4xl">Pass good tech along.</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-body">
            List your device and help it find its next home.
          </p>
          <Link className="mt-7 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary" href="/sell">
            Sell with us
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
