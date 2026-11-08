"use client";

import Image from "next/image";
import { useState } from "react";
import { getCategoryGlyph } from "../../components/listing-card";
import ModelViewer from "./model-viewer";

export default function ListingGallery({ title, category, imageUrls, modelSrc }: {
  title: string;
  category: string;
  imageUrls: string[];
  modelSrc?: string;
}) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<"photos" | "model">(modelSrc ? "model" : "photos");
  const hasImages = imageUrls.length > 0;

  return (
    <figure className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-surface-soft">
      <span className="absolute left-5 top-5 z-10 rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-body">
        {category || "Technology"}
      </span>
      {modelSrc && (
        <div className="absolute right-4 top-4 z-10 flex gap-1 rounded-full bg-canvas p-1 shadow-sm" aria-label="Listing media view">
          <button
            type="button"
            aria-pressed={view === "photos"}
            onClick={() => setView("photos")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === "photos" ? "bg-primary text-on-primary" : "text-ink hover:bg-surface-strong"}`}
          >
            Photos
          </button>
          <button
            type="button"
            aria-pressed={view === "model"}
            onClick={() => setView("model")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === "model" ? "bg-primary text-on-primary" : "text-ink hover:bg-surface-strong"}`}
          >
            3D model
          </button>
        </div>
      )}
      {view === "model" && modelSrc ? (
        <ModelViewer src={modelSrc} title={title} />
      ) : hasImages ? (
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
      {view === "photos" && imageUrls.length > 1 && (
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
