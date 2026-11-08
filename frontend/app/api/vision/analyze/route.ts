
import { auth0, auth0Configured } from "@/lib/auth0";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json(
      { error: "Request origin could not be verified." },
      { status: 403 }
    );
  }


    const url = new URL(request.url);

    const localDemo =
    process.env.NODE_ENV === "development" &&
    process.env.DEMO_VISION_NO_AUTH === "true" &&
    !auth0Configured &&
    ["localhost", "127.0.0.1"].includes(url.hostname);

    if (!localDemo) {
    const session = await auth0?.getSession();

    if (!session?.user?.sub) {
        return Response.json(
        { error: "Sign in to analyze photos." },
        { status: 401 }
        );
    }
    }


  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid photo upload." },
      { status: 400 }
    );
  }

  const photos = form.getAll("photos");

  if (
    photos.length < 1 ||
    photos.length > 5 ||
    photos.some(
      (photo) =>
        !(photo instanceof File) ||
        photo.size === 0 ||
        photo.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(photo.type)
    )
  ) {
    return Response.json(
      { error: "Upload 1–5 images, each no larger than 10 MB." },
      { status: 400 }
    );
  }

  const upload = new FormData();

  for (const photo of photos) {
    upload.append("photos", photo);
  }

  const backend = (
    process.env.VISION_API_URL ??
    "http://127.0.0.1:5000"
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${backend}/api/vision/analyze`,
      {
        method: "POST",
        body: upload,
        cache: "no-store",
      }
    );

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Vision backend unavailable:", error);

    return Response.json(
      { error: "Cannot connect to Vision Agent backend." },
      { status: 502 }
    );
  }
}
