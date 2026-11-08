"use client";

import Image from "next/image";
import { useState } from "react";
import { getCategoryGlyph } from "../../components/listing-card";

export default function ListingGallery({ title, category, imageUrls }: {
  title: string;
  category: string;
  imageUrls: string[];
}) {
  const [index, setIndex] = useState(0);
  const hasImages = imageUrls.length > 0;

  return (
    <figure className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-surface-soft">
      <span className="absolute left-5 top-5 z-10 rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-body">
        {category || "Technology"}
      </span>
      {hasImages ? (
        <Image
          key={imageUrls[index]}
          alt={`${title} photo ${index + 1} of ${imageUrls.length}`}
          className="object-contain"
          fill
          priority={index === 0}
          sizes="(max-width: 1024px) 100vw, 50vw"
          src={imageUrls[index]}
          unoptimized
        />
      ) : (
        <span className="grid size-40 place-items-center rounded-full bg-surface-strong text-8xl sm:size-48" aria-hidden="true">
          {getCategoryGlyph(category)}
        </span>
      )}
      {imageUrls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setIndex((index - 1 + imageUrls.length) % imageUrls.length)}
            className="absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-canvas/90 text-2xl text-ink shadow hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setIndex((index + 1) % imageUrls.length)}
            className="absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-canvas/90 text-2xl text-ink shadow hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true">›</span>
          </button>
          <span className="absolute bottom-5 right-5 z-10 rounded-full bg-canvas/90 px-3 py-1 text-xs font-semibold text-ink" aria-live="polite">
            {index + 1} / {imageUrls.length}
          </span>
        </>
      )}
    </figure>
  );
}
