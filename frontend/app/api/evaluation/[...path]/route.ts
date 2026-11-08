import { auth0 } from "@/lib/auth0";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: RouteContext) {
  const session = await auth0?.getSession();
  if (!session?.user.sub) {
    return Response.json({ error: "Sign in to view evaluation data." }, { status: 401 });
  }

  const { path } = await params;
  if (path.length !== 1 || !["summary", "runs"].includes(path[0])) {
    return Response.json({ error: "Evaluation endpoint not found." }, { status: 404 });
  }

  const backendBase = (
    process.env.NEGOTIATION_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:5000"
  ).replace(/\/+$/, "");
  const target = new URL(`/api/evaluation/${path[0]}`, backendBase);
  target.search = new URL(request.url).search;

  try {
    const upstream = await fetch(target, { cache: "no-store" });
    const payload = await upstream.json();
    return Response.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "The evaluation service is unavailable." }, { status: 502 });
  }
}
