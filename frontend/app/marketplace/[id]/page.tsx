import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceListingByRouteId } from "@/lib/listing-store";
import { getCategoryGlyph } from "../listing-card";

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

export default async function ListingDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = getMarketplaceListingByRouteId(id);

  if (!listing) notFound();

  const condition = formatLabel(listing.condition);
  const category = formatLabel(listing.category);
  const listedDate = formatListedDate(listing.listedDate);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="bg-surface-dark text-on-dark">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="text-lg font-semibold tracking-tight text-primary" href="/" aria-label="Forme home">
            forme
          </Link>
          <nav className="flex items-center gap-6 text-sm" aria-label="Main navigation">
            <Link className="text-on-dark-soft" href="/marketplace">Marketplace</Link>
            <Link className="hidden text-on-dark-soft sm:inline" href="/#sell">Sell with us</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 lg:px-12">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary" href="/marketplace">
          <span aria-hidden="true">←</span> Back to marketplace
        </Link>
      </div>

      <section className="mx-auto grid max-w-7xl items-start gap-10 px-5 pb-20 pt-8 sm:px-8 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-12 lg:pt-10">
        <figure className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-surface-soft">
          <span className="absolute left-5 top-5 rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-body">
            {category ?? "Technology"}
          </span>
          <span className="grid size-40 place-items-center rounded-full bg-surface-strong text-8xl sm:size-48 sm:text-9xl" aria-hidden="true">
            {getCategoryGlyph(listing.category)}
          </span>
          <figcaption className="absolute inset-x-4 bottom-4 rounded-2xl bg-canvas p-4 text-center text-sm text-body sm:inset-x-6 sm:bottom-6 sm:p-5">
            3D product preview coming soon
          </figcaption>
        </figure>

        <article className="flex flex-col pt-2 lg:pt-8">
          <p className="text-sm font-medium text-primary">{category ?? "Technology"}</p>
          <h1 className="mt-3 text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-[44px]">
            {listing.title}
          </h1>
          <p className="mt-5 font-mono text-2xl font-medium text-ink sm:text-3xl">
            {formatPrice(listing.price)}
          </p>

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

          <Link className="mt-7 inline-flex h-11 w-fit items-center rounded-full bg-surface-strong px-5 text-sm font-semibold text-ink" href="/marketplace">
            Continue browsing
          </Link>
        </article>
      </section>

      <footer className="border-t border-hairline bg-canvas px-5 py-8 text-sm text-body sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link className="font-semibold text-primary" href="/">forme</Link>
          <Link className="text-primary" href="/marketplace">Marketplace</Link>
        </div>
      </footer>
    </main>
  );
}
