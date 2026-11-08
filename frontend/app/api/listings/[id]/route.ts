import { getMarketplaceListingByRouteId } from "@/lib/listing-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = getMarketplaceListingByRouteId(id);
  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 });
  }
  return Response.json({ listing }, { headers: { "Cache-Control": "no-store" } });
}
