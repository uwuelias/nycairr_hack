import { searchMarketplaceListings } from "@/lib/listing-store";

export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length > 100) {
    return Response.json(
      { error: "Search must be 100 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const listings = searchMarketplaceListings(query);
    return Response.json(
      { listings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to fetch marketplace listings:", error);
    return Response.json(
      { error: "Marketplace listings are temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
