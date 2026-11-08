import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { io } from "next/cache";
import { getMarketplaceListingByRouteId } from "@/lib/listing-store";
import { formatMarketplaceCondition } from "@/lib/marketplace-filters";
import SiteFooter from "@/app/components/footer";
import SiteNavbar from "@/app/components/navbar";
import ListingGallery from "./listing-gallery";

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(price);
}

function formatLabel(value: string | null) {
  if (!value) return null;
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatListedDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ListingDetailsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 sm:pb-24 lg:px-12 lg:pt-10" aria-label="Loading listing">
      <div className="h-5 w-40 animate-pulse rounded-full bg-surface-strong" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="aspect-square animate-pulse rounded-3xl bg-surface-soft" />
        <div className="space-y-5 pt-2 lg:pt-8">
          <div className="h-4 w-28 animate-pulse rounded-full bg-surface-strong" />
          <div className="h-12 max-w-lg animate-pulse rounded-xl bg-surface-soft" />
          <div className="h-8 w-36 animate-pulse rounded-xl bg-surface-soft" />
          <div className="mt-8 h-32 animate-pulse rounded-3xl bg-surface-soft" />
        </div>
      </div>
    </div>
  );
}

async function ListingDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await io();
  const listing = getMarketplaceListingByRouteId(id);

  if (!listing) notFound();

  const condition = formatMarketplaceCondition(listing.condition);
  const category = formatLabel(listing.category);
  const listedDate = formatListedDate(listing.listedDate);

  return (
    <>
      <div className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 lg:px-12">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary" href="/marketplace">
          <span aria-hidden="true">←</span> Back to marketplace
        </Link>
      </div>

      <section className="mx-auto grid max-w-7xl items-start gap-10 px-5 pb-20 pt-8 sm:px-8 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12 lg:pt-10">
        <ListingGallery
          title={listing.title}
          category={category ?? "Technology"}
          imageUrls={listing.imageUrls.length ? listing.imageUrls : listing.imageUrl ? [listing.imageUrl] : []}
        />

        <article className="flex flex-col pt-2 lg:pt-8">
          <p className="text-sm font-medium text-primary">{category ?? "Technology"}</p>
          <h1 className="mt-3 text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-[44px]">
            {listing.title}
          </h1>
          <p className="mt-5 font-mono text-2xl font-medium text-ink sm:text-3xl">
            {formatPrice(listing.price)}
          </p>
          {listing.sellerUsername && (
            <p className="mt-3 text-sm text-body">Sold by <span className="font-semibold text-ink">{listing.sellerUsername}</span></p>
          )}

          {listing.description?.trim() && (
            <section className="mt-8">
              <h2 className="text-base font-semibold">About this listing</h2>
              <p className="mt-2 whitespace-pre-line text-base leading-7 text-body">
                {listing.description}
              </p>
            </section>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-0 rounded-3xl bg-surface-soft px-5 sm:px-6">
            {listing.brand && (
              <div className="border-b border-hairline py-4">
                <dt className="text-xs text-body">Brand</dt>
                <dd className="mt-1 text-sm font-semibold">{listing.brand}</dd>
              </div>
            )}
            {listing.model && (
              <div className="border-b border-hairline py-4">
                <dt className="text-xs text-body">Model</dt>
                <dd className="mt-1 text-sm font-semibold">{listing.model}</dd>
              </div>
            )}
            {condition && (
              <div className="py-4">
                <dt className="text-xs text-body">Condition</dt>
                <dd className="mt-1 text-sm font-semibold">{condition}</dd>
              </div>
            )}
            {listedDate && (
              <div className="py-4">
                <dt className="text-xs text-body">Listed</dt>
                <dd className="mt-1 text-sm font-semibold">{listedDate}</dd>
              </div>
            )}
          </dl>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Buy Now
            </button>
            <Link
              href="/negotiate"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-hairline px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Negotiate
            </Link>
          </div>

          <Link className="mt-7 inline-flex h-11 w-fit items-center rounded-full bg-surface-strong px-5 text-sm font-semibold text-ink" href="/marketplace">
            Continue browsing
          </Link>
        </article>
      </section>
    </>
  );
}

export default function ListingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <SiteNavbar />

      <Suspense fallback={<ListingDetailsLoading />}>
        <ListingDetailsContent params={params} />
      </Suspense>

      <SiteFooter />
    </main>
  );
}
