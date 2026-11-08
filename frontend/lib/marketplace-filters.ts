export const MARKETPLACE_CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like-new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
] as const;

export const MARKETPLACE_SORTS = ["newest", "price_low_high", "price_high_low"] as const;

export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

export function formatMarketplaceCondition(value: string | null) {
  if (!value) return null;
  const condition = MARKETPLACE_CONDITIONS.find((item) => item.value === value);
  return condition?.label ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
