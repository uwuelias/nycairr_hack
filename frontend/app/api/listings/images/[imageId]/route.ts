import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(imageId)) {
    return new Response("Not found", { status: 404 });
  }

  const extension = imageId.slice(imageId.lastIndexOf(".") + 1);
  const uploadDirectory = resolve(
    process.cwd(),
    process.env.APP_UPLOAD_DIRECTORY ?? "../backend/databases/uploads/listings",
  );

  try {
    const image = await readFile(resolve(uploadDirectory, imageId));
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": IMAGE_CONTENT_TYPES[extension],
        "Content-Length": String(image.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}