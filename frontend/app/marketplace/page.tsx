"use client";

import { useEffect, useState } from "react";
import SiteFooter from "@/app/components/footer";
import SiteNavbar from "@/app/components/navbar";
import ListingCard from "../components/listing-card";
import BrowsingChat from "../components/browsing-chat";
import type { MarketplaceListing } from "@/lib/listing-store";
import { MARKETPLACE_CONDITIONS } from "@/lib/marketplace-filters";

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [conditions, setConditions] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [result, setResult] = useState<{
    requestKey: string;
    listings: MarketplaceListing[];
    hasNextPage: boolean;
    totalPages: number;
  } | null>(null);
  const [failedRequest, setFailedRequest] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const query = search.trim();
  const requestParams = new URLSearchParams({ q: query, page: String(page), sort });
  conditions.forEach((condition) => requestParams.append("condition", condition));
  if (minPrice) requestParams.set("minPrice", minPrice);
  if (maxPrice) requestParams.set("maxPrice", maxPrice);
  const requestKey = requestParams.toString();
  const listings = result?.requestKey === requestKey ? result.listings : [];
  const hasNextPage = result?.requestKey === requestKey && result.hasNextPage;
  const totalPages = result?.requestKey === requestKey ? result.totalPages : 0;
  const firstVisiblePage = Math.max(1, Math.min(page - 2, totalPages - 4));
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstVisiblePage + index,
  );
  const error = failedRequest === requestKey;
  const invalidPriceRange = Boolean(minPrice && maxPrice && Number(minPrice) > Number(maxPrice));
  const loading = !error && !invalidPriceRange && (result === null || result.requestKey !== requestKey);
  const hasActiveFilters = conditions.length > 0 || Boolean(minPrice || maxPrice) || sort !== "newest";

  function toggleSelection(value: string, selected: string[], update: (next: string[]) => void) {
    update(selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]);
    setPage(1);
  }

  useEffect(() => {
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) return;

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/listings?" + requestKey,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("Could not load listings.");

        const result = (await response.json()) as {
          listings: MarketplaceListing[];
          hasNextPage: boolean;
          totalPages: number;
        };
        setResult({
          requestKey,
          listings: result.listings,
          hasNextPage: result.hasNextPage,
          totalPages: result.totalPages,
        });
        setFailedRequest(null);
      } catch {
        if (!controller.signal.aborted) setFailedRequest(requestKey);
      }
    }, query ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [minPrice, maxPrice, query, requestKey, retryCount]);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <SiteNavbar />

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
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search devices, brands, or categories"
                type="search"
                value={search}
              />
              {search && (
                <button className="text-sm font-medium text-primary" onClick={() => {
                  setSearch("");
                  setPage(1);
                }} type="button">
                  Clear
                </button>
              )}
            </label>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="h-fit rounded-3xl border border-hairline bg-canvas p-5" aria-label="Filter listings">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Filters</h3>
                {hasActiveFilters && (
                  <button
                    className="text-xs font-semibold text-primary"
                    onClick={() => {
                      setConditions([]);
                      setMinPrice("");
                      setMaxPrice("");
                      setSort("newest");
                      setPage(1);
                    }}
                    type="button"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm font-semibold">Price range</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs text-body">
                    Min
                    <input
                      className="mt-1 h-11 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary"
                      min="0"
                      onChange={(event) => {
                        setMinPrice(event.target.value);
                        setPage(1);
                      }}
                      placeholder="$0"
                      type="number"
                      value={minPrice}
                    />
                  </label>
                  <label className="text-xs text-body">
                    Max
                    <input
                      className="mt-1 h-11 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary"
                      min="0"
                      onChange={(event) => {
                        setMaxPrice(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Any"
                      type="number"
                      value={maxPrice}
                    />
                  </label>
                </div>
                {invalidPriceRange && <p className="mt-2 text-xs text-semantic-down">Minimum must be below maximum.</p>}
              </fieldset>

              <fieldset className="mt-6">
                <legend className="text-sm font-semibold">Condition</legend>
                <div className="mt-3 space-y-3">
                  {MARKETPLACE_CONDITIONS.map((condition) => (
                    <label key={condition.value} className="flex cursor-pointer items-center gap-3 text-sm text-body">
                      <input
                        checked={conditions.includes(condition.value)}
                        className="size-4 accent-primary"
                        onChange={() => toggleSelection(condition.value, conditions, setConditions)}
                        type="checkbox"
                      />
                      {condition.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </aside>

            <div className="min-w-0">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 text-sm text-body" aria-live="polite">
                <span>
                  {invalidPriceRange
                    ? "Check your price range"
                    : loading
                      ? "Finding listings…"
                      : listings.length > 0
                        ? `Showing ${(page - 1) * 30 + 1}–${(page - 1) * 30 + listings.length}${search ? ` matches for “${search}”` : " matching listings"}`
                        : search || hasActiveFilters
                          ? "No matching listings"
                          : "No listings available"}
                </span>
                <label className="flex items-center gap-2 text-sm text-body">
                  Sort
                  <select
                    className="h-10 rounded-full border border-hairline bg-canvas px-4 text-sm text-ink outline-none focus:border-primary"
                    onChange={(event) => {
                      setSort(event.target.value);
                      setPage(1);
                    }}
                    value={sort}
                  >
                    <option value="newest">Newest</option>
                    <option value="price_low_high">Price: low to high</option>
                    <option value="price_high_low">Price: high to low</option>
                  </select>
                </label>
              </div>

              {invalidPriceRange ? (
                <div className="rounded-3xl border border-hairline bg-surface-soft px-6 py-16 text-center">
                  <p className="text-lg font-semibold">The price range isn’t valid.</p>
                  <p className="mt-2 text-sm text-body">Enter a minimum price lower than the maximum.</p>
                </div>
              ) : error ? (
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
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing) => (
                  <ListingCard key={listing.routeId} listing={listing} />
                ))}
              </div>
              {totalPages > 1 && (
                <nav className="mt-12 flex items-center justify-center gap-3" aria-label="Marketplace pagination">
                  {page > 1 && (
                    <button
                      aria-label="Go to previous page"
                      className="grid size-11 place-items-center rounded-full bg-surface-strong text-ink"
                      onClick={() => setPage((current) => current - 1)}
                      type="button"
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                  )}
                  {visiblePages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      aria-current={pageNumber === page ? "page" : undefined}
                      aria-label={`Go to page ${pageNumber}`}
                      className={`grid size-11 place-items-center rounded-full text-sm font-semibold ${pageNumber === page ? "bg-primary text-on-primary" : "bg-surface-strong text-ink"}`}
                      onClick={() => setPage(pageNumber)}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  {hasNextPage && (
                    <button
                      aria-label="Go to next page"
                      className="grid size-11 place-items-center rounded-full bg-primary text-on-primary"
                      onClick={() => setPage((current) => current + 1)}
                      type="button"
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </nav>
              )}
            </>
          ) : loading ? (
            <p className="py-20 text-center text-sm text-body">Loading the latest listings…</p>
          ) : (
            <div className="rounded-3xl border border-hairline bg-surface-soft px-6 py-16 text-center">
              <p className="text-lg font-semibold">No listings found.</p>
              <p className="mt-2 text-sm text-body">Try another device, brand, or category.</p>
            </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <BrowsingChat />
      <SiteFooter />
    </main>
  );
}
