import Image from "next/image";
import Link from "next/link";
import type { MarketplaceListing } from "@/lib/listing-store";
import { formatMarketplaceCondition } from "@/lib/marketplace-filters";

export function getCategoryGlyph(category: string) {
  const value = category.toLowerCase();

  if (value.includes("laptop")) return "💻";
  if (value.includes("phone")) return "📱";
  if (value.includes("watch")) return "⌚";
  if (value.includes("headphone")) return "🎧";
  if (value.includes("camera")) return "📷";
  if (value.includes("peripheral")) return "⌨️";
  if (value.includes("game") || value.includes("console")) return "🎮";
  if (value.includes("gpu")) return "🖥️";
  if (value.includes("speaker")) return "🔊";
  if (value.includes("monitor")) return "🖥️";
  if (value.includes("tablet")) return "📱";
  if (value.includes("audio")) return "🎵";
  return "⌘";
}

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

export default function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const condition = formatMarketplaceCondition(listing.condition);
  const listedDate = listing.listedDate
    ? new Date(listing.listedDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      timeZone: "UTC",
      })
    : null;

  return (
    <article className="min-w-0">
      <Link
        className="group block h-full rounded-3xl border border-hairline bg-surface-card p-5 transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
        href={`/marketplace/${encodeURIComponent(listing.routeId)}`}
      >
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-surface-soft">
          {listing.imageUrl ? (
            <Image
              alt={listing.title}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              src={listing.imageUrl}
              unoptimized
            />
          ) : (
            <span
              className="grid size-24 place-items-center rounded-full bg-surface-strong text-5xl"
              aria-hidden="true"
            >
              {getCategoryGlyph(listing.category)}
            </span>
          )}
        </div>
        <div className="pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-surface-strong px-3 py-1 text-xs font-semibold text-ink">
              {formatLabel(listing.category)}
            </span>
            {condition && <span className="truncate text-xs text-body">{condition}</span>}
          </div>
          <h2 className="mt-4 line-clamp-2 min-h-12 text-base font-semibold leading-snug text-ink group-hover:text-primary">
            {listing.title}
          </h2>
          {listing.sellerUsername && (
            <p className="mt-2 truncate text-xs text-body">Sold by {listing.sellerUsername}</p>
          )}
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-hairline-soft pt-4">
            <div className="min-w-0 text-sm text-body">
              {listing.brand && <span>{listing.brand}</span>}
              {listing.model && listing.model !== listing.brand && <span>{listing.brand ? " · " : ""}{listing.model}</span>}
              {listedDate && <span className="mt-1 block text-xs text-muted">Listed {listedDate}</span>}
            </div>
            <strong className="shrink-0 font-mono text-base font-medium text-ink">
              {formatPrice(listing.price)}
            </strong>
          </div>
        </div>
      </Link>
    </article>
  );
}
