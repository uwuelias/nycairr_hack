import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const backendBase = (
    process.env.NEGOTIATION_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:5000"
  ).replace(/\/+$/, "");
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, backendBase);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const sessionToken = request.headers.get("x-session-token");
  if (contentType) headers.set("content-type", contentType);
  if (sessionToken) headers.set("x-session-token", sessionToken);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Negotiation backend request failed:", error);
    return Response.json(
      { error: "The negotiation backend is unavailable. Make sure it is running on port 5000." },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
