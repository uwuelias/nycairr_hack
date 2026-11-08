"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { MARKETPLACE_CATEGORIES, SELLING_CONDITIONS } from "@/lib/marketplace-options";

type ListingPhoto = { id: string; file: File; previewUrl: string };

type VisionClaim = {
  attribute: string;
  value: string | null;
  status: string;
  evidence_image: number | null;
  evidence_description: string | null;
};

type VisionResponse = {
  analysis: {
    claims: VisionClaim[];
    next_action: string;
    question: string | null;
  };
  coverage: {
    allowed_to_list: boolean;
    missing_views: string[];
    quality_issues: string[];
  };
};

export default function SellForm() {
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const previewUrls = useRef(new Set<string>());
  const formRef = useRef<HTMLFormElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<VisionResponse | null>(null);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    setPhotoError("");

    const remainingSlots = 8 - photos.length;
    if (selectedFiles.length > remainingSlots) {
      setPhotoError("You can add up to 8 photos.");
    }

    const validFiles = selectedFiles.slice(0, remainingSlots).filter((file) => {
      if (!file.type.startsWith("image/")) {
        setPhotoError("Choose image files only.");
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        setPhotoError("Each photo must be 10 MB or smaller.");
        return false;
      }
      return true;
    });

    setPhotos((current) => [
      ...current,
      ...validFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        return {
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          previewUrl,
        };
      }),
    ]);
  }

  function removePhoto(photo: ListingPhoto) {
    URL.revokeObjectURL(photo.previewUrl);
    previewUrls.current.delete(photo.previewUrl);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
  }

  async function handleAnalyze() {
    if (photos.length === 0) {
      setAiError("Upload at least one photo first.");
      return;
    }

    setAnalyzing(true);
    setAiError("");
    setAiResult(null);

    try {
      const formData = new FormData();
      const selected = photos.slice(0, 5);

      const totalBytes = selected.reduce(
        (sum, photo) => sum + photo.file.size,
        0
      );

      if (totalBytes > 30 * 1024 * 1024) {
        throw new Error("The selected photos exceed the 30 MB analysis limit.");
      }

      selected.forEach((photo) => {
        formData.append("photos", photo.file);
      });

      const response = await fetch("/api/vision/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI analysis failed.");
      }

      setAiResult(data as VisionResponse);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Analysis failed."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function handleApplyAiDraft() {
    if (!aiResult || !formRef.current) return;

    const getClaim = (attribute: string) =>
      aiResult.analysis.claims.find(
        (claim) =>
          claim.attribute === attribute &&
          claim.value &&
          ["observed", "inferred", "seller_confirmed"].includes(claim.status)
      );

    const brand = getClaim("brand")?.value ?? "";
    const category = getClaim("category")?.value?.toLowerCase() ?? "";
    const color = getClaim("color")?.value ?? "";

    // Use an exact model only if the seller has confirmed it.
    const modelClaim = getClaim("model");
    const model =
      modelClaim?.status === "seller_confirmed"
        ? modelClaim.value ?? ""
        : "";

    const categoryMap: Record<string, string> = {
      smartphone: "phones",
      phone: "phones",
      iphone: "phones",
      headphones: "headphones",
      laptop: "laptops",
      tablet: "tablets",
      camera: "cameras",
      speaker: "speakers",
      smartwatch: "smartwatches",
      monitor: "monitors",
    };

    const categoryValue = categoryMap[category] ?? category;

    const form = formRef.current;

    const titleInput = form.elements.namedItem("title") as HTMLInputElement | null;
    const categoryInput = form.elements.namedItem("category") as HTMLSelectElement | null;
    const descriptionInput = form.elements.namedItem("description") as HTMLTextAreaElement | null;

    const categoryLabel =
      categoryValue === "phones"
        ? "phone"
        : category || "item";

    const title = [brand, model, categoryLabel]
      .filter(Boolean)
      .join(" ");

    if (titleInput && title.trim()) {
      titleInput.value = title.slice(0, 120);
    }

    if (
      categoryInput &&
      Array.from(categoryInput.options).some(
        (option) => option.value === categoryValue
      )
    ) {
      categoryInput.value = categoryValue;
    }

    if (descriptionInput) {
      const description = [
        `${brand ? brand + " " : ""}${categoryLabel}.`,
        color ? `AI-suggested color: ${color}.` : "",
        "Please review the photographs and confirm the model, condition, accessories, and functionality before listing.",
      ]
        .filter(Boolean)
        .join(" ");

      descriptionInput.value = description;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setSubmitted(false);
    if (photos.length === 0) {
      setPhotoError("Add at least one photo to continue.");
      return;
    }

    setPhotoError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    photos.forEach(({ file }) => formData.append("photos", file));

    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        body: formData,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "We couldn't submit your listing. Please try again.");
      }

      formRef.current?.reset();
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
      setPhotos([]);
      setPhotoError("");
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn't submit your listing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-3xl border border-hairline bg-canvas p-5 sm:p-7" aria-labelledby="photos-heading">
          <div>
            <h2 id="photos-heading" className="text-lg font-semibold">Photos</h2>
            <p className="mt-1 text-sm text-body">Add up to 8 clear photos of your item.</p>
          </div>

          <label className="mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-soft px-5 py-8 text-center transition-colors hover:bg-surface-strong">
            <span className="grid size-12 place-items-center rounded-full bg-canvas text-2xl text-primary" aria-hidden="true">＋</span>
            <span className="mt-3 text-sm font-semibold text-ink">Choose photos</span>
            <span className="mt-1 text-xs text-body">JPG, PNG, or WebP · 10 MB max each</span>
            <input
              className="sr-only"
              accept="image/*"
              disabled={photos.length >= 8}
              multiple
              onChange={addPhotos}
              type="file"
            />
          </label>

          {photoError && <p className="mt-3 text-sm text-semantic-down" role="alert">{photoError}</p>}

          {photos.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected photos">
              {photos.map((photo, index) => (
                <li className="relative aspect-square overflow-hidden rounded-2xl bg-surface-soft" key={photo.id}>
                  <Image
                    alt={`Selected listing photo ${index + 1}: ${photo.file.name}`}
                    className="h-full w-full object-cover"
                    height={240}
                    src={photo.previewUrl}
                    unoptimized
                    width={240}
                  />
                  <button
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-canvas text-ink"
                    onClick={() => removePhoto(photo)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 space-y-4">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || photos.length === 0}
              className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary disabled:opacity-50"
            >
              {analyzing ? "Analyzing photos..." : "Analyze with AI"}
            </button>

            {photos.length > 5 && (
              <p className="text-sm text-body">
                AI will analyze the first 5 photos. All 8 can still be used in your listing.
              </p>
            )}

            {aiError && (
              <p className="text-sm text-red-600" role="alert">
                {aiError}
              </p>
            )}

            {aiResult && (
              <div className="space-y-3 rounded-xl border border-hairline p-4">
                <h3 className="font-semibold">AI Analysis Results</h3>

                <p className="text-xs text-body">
                  AI suggestions are not verified. Review before listing.
                </p>

                <button
                  type="button"
                  onClick={handleApplyAiDraft}
                  className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-soft"
                >
                  Fill listing with AI
                </button>


                {aiResult.analysis.claims
                  .filter(
                    (claim) =>
                      claim.value !== null && claim.status !== "unknown"
                  )
                  .map((claim, index) => (
                    <div
                      key={`${claim.attribute}-${index}`}
                      className="text-sm"
                    >
                      <span className="font-semibold capitalize">
                        {claim.attribute}:
                      </span>{" "}
                      {claim.value}
                      <span className="text-body">
                        {" "}({claim.status})
                      </span>

                      {claim.evidence_image !== null && (
                        <span className="text-body">
                          {" "}— Photo {claim.evidence_image + 1}
                        </span>
                      )}
                    </div>
                  ))}

                {aiResult.coverage.missing_views.length > 0 && (
                  <p className="text-sm text-body">
                    Suggested additional views:{" "}
                    {aiResult.coverage.missing_views.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

        </section>

        <section className="rounded-3xl border border-hairline bg-canvas p-5 sm:p-7" aria-labelledby="details-heading">
          <div>
            <h2 id="details-heading" className="text-lg font-semibold">Item details</h2>
            <p className="mt-1 text-sm text-body">A few details help buyers find the right item.</p>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-ink">
              Title <span className="text-primary">*</span>
              <input
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-xl border border-hairline bg-canvas px-4 text-sm outline-none focus:border-2 focus:border-primary"
                maxLength={120}
                minLength={3}
                name="title"
                placeholder="e.g. Wireless headphones"
                required
                type="text"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Category <span className="text-primary">*</span>
                <select
                  className="mt-2 h-12 w-full rounded-xl border border-hairline bg-canvas px-4 text-sm outline-none focus:border-2 focus:border-primary"
                  defaultValue=""
                  name="category"
                  required
                >
                  <option disabled value="">Select category</option>
                  {MARKETPLACE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                Condition <span className="text-primary">*</span>
                <select
                  className="mt-2 h-12 w-full rounded-xl border border-hairline bg-canvas px-4 text-sm outline-none focus:border-2 focus:border-primary"
                  defaultValue=""
                  name="condition"
                  required
                >
                  <option disabled value="">Select condition</option>
                  {SELLING_CONDITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <label className="block max-w-xs text-sm font-medium text-ink">
              Price <span className="text-primary">*</span>
              <span className="relative mt-2 block">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body">$</span>
                <input
                  className="h-12 w-full rounded-xl border border-hairline bg-canvas pl-8 pr-4 text-sm outline-none focus:border-2 focus:border-primary"
                  min="0.01"
                  name="price"
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                />
              </span>
            </label>

            <label className="block text-sm font-medium text-ink">
              Description <span className="text-primary">*</span>
              <textarea
                className="mt-2 min-h-36 w-full resize-y rounded-xl border border-hairline bg-canvas px-4 py-3 text-sm leading-6 outline-none focus:border-2 focus:border-primary"
                maxLength={2000}
                minLength={10}
                name="description"
                placeholder="Describe the item, its features, and any wear or marks."
                required
              />
              <span className="mt-1 block text-xs font-normal text-body">Up to 2,000 characters.</span>
            </label>
          </div>
        </section>
      </div>

      {submitted && (
        <div className="rounded-2xl border border-hairline bg-canvas px-5 py-4 text-sm text-body" role="status" aria-live="polite">
          Your listing has been posted.
        </div>
      )}

      {submitError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-semantic-down" role="alert">{submitError}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="inline-flex h-11 items-center justify-center rounded-full bg-surface-strong px-5 text-sm font-semibold text-ink" href="/marketplace">
          Cancel
        </Link>
        <button className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-7 text-sm font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Submitting…" : "Submit listing"}
        </button>
      </div>
      <p className="text-right text-xs text-body">Your listing and photos will be saved to the marketplace.</p>
    </form>
  );
}
