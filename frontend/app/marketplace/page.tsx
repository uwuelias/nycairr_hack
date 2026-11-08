"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthActions from "@/app/components/auth-actions";
import ListingCard from "./listing-card";
import type { MarketplaceListing } from "@/lib/listing-store";

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{
    query: string;
    listings: MarketplaceListing[];
  } | null>(null);
  const [failedQuery, setFailedQuery] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const query = search.trim();
  const listings = result?.query === query ? result.listings : [];
  const error = failedQuery === query;
  const loading = !error && (result === null || result.query !== query);

  useEffect(() => {
    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/listings?q=" + encodeURIComponent(query),
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Could not load listings.");

        const result = (await response.json()) as {
          listings: MarketplaceListing[];
        };
        setResult({ query, listings: result.listings });
        setFailedQuery(null);
      } catch {
        if (!controller.signal.aborted) setFailedQuery(query);
      }
    }, query ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, retryCount]);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 bg-surface-dark text-on-dark">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="text-lg font-semibold tracking-tight text-primary" href="/" aria-label="Forme home">
            forme
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-on-dark sm:flex" aria-label="Main navigation">
            <Link className="text-on-dark" href="/marketplace" aria-current="page">Marketplace</Link>
            <Link className="text-body-muted" href="/#sell">Sell with us</Link>
          </nav>
          <AuthActions />
        </div>
      </header>

      <section className="bg-surface-dark text-on-dark">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_0.85fr] lg:gap-20 lg:px-12 lg:py-24">
          <div>
            <p className="inline-flex rounded-full bg-surface-dark-elevated px-3 py-1.5 text-xs font-semibold tracking-wide text-on-dark-soft">
              PRE-LOVED TECHNOLOGY
            </p>
            <h1 className="mt-6 max-w-2xl text-5xl font-normal leading-[1.04] tracking-[-.04em] sm:text-6xl lg:text-[68px]">
              Find tech that feels new again.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-on-dark-soft">
              Thoughtful finds across phones, computers, audio, and more. Every listing deserves a closer look.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md py-4 sm:py-8">
            <div className="rounded-3xl bg-surface-dark-elevated p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-on-dark-soft">FEATURED CATEGORY</span>
                <span className="grid size-10 place-items-center rounded-full bg-surface-strong text-xl" aria-hidden="true">⌘</span>
              </div>
              <div className="mt-10 flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-normal tracking-tight">Technology</p>
                  <p className="mt-2 text-sm text-on-dark-soft">Devices with more life to give</p>
                </div>
                <span className="text-6xl" aria-hidden="true">💻</span>
              </div>
              <div className="mt-8 border-t border-white/10 pt-5 text-sm text-on-dark-soft">
                Phones <span className="mx-2">·</span> Computers <span className="mx-2">·</span> Audio
              </div>
            </div>
            <div className="absolute -bottom-1 right-2 rounded-full bg-canvas px-4 py-2 text-sm font-medium text-ink shadow-[0_4px_12px_rgba(0,0,0,0.12)] sm:right-0">
              A better second life
            </div>
          </div>
        </div>
      </section>

      <section className="bg-canvas px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-8 border-b border-hairline pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">The marketplace</p>
              <h2 className="mt-2 text-3xl font-normal tracking-tight sm:text-4xl">Technology, worth keeping.</h2>
              <p className="mt-3 text-base text-body">Browse the latest listings from our community.</p>
            </div>
            <label className="flex h-12 w-full items-center gap-3 rounded-full bg-surface-strong px-5 text-ink md:max-w-md">
              <svg className="size-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" />
                <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              <input
                aria-label="Search marketplace listings"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search devices, brands, or categories"
                type="search"
                value={search}
              />
              {search && (
                <button className="text-sm font-medium text-primary" onClick={() => setSearch("")} type="button">
                  Clear
                </button>
              )}
            </label>
          </div>

          <div className="mb-6 mt-7 flex items-center justify-between gap-4 text-sm text-body" aria-live="polite">
            <span>
              {loading
                ? "Finding listings…"
                : search
                  ? `${listings.length} matching ${listings.length === 1 ? "listing" : "listings"}`
                  : `${listings.length} newest listings`}
            </span>
            <span className="hidden sm:inline">Sorted by recently listed</span>
          </div>

          {error ? (
            <div className="rounded-3xl border border-hairline bg-surface-soft px-6 py-16 text-center">
              <p className="text-lg font-semibold">Listings couldn’t load.</p>
              <p className="mt-2 text-sm text-body">Please try again in a moment.</p>
              <button
                className="mt-5 h-11 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary"
                onClick={() => setRetryCount((count) => count + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : listings.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing) => (
                <ListingCard key={listing.routeId} listing={listing} />
              ))}
            </div>
          ) : loading ? (
            <p className="py-20 text-center text-sm text-body">Loading the latest listings…</p>
          ) : (
            <div className="rounded-3xl border border-hairline bg-surface-soft px-6 py-16 text-center">
              <p className="text-lg font-semibold">No listings found.</p>
              <p className="mt-2 text-sm text-body">Try another device, brand, or category.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-hairline bg-canvas px-5 py-10 text-sm text-body sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="font-semibold text-primary" href="/">forme</Link>
          <span>Good technology deserves another life.</span>
          <Link className="text-primary" href="/#sell">Sell with us</Link>
        </div>
      </footer>
    </main>
  );
}
