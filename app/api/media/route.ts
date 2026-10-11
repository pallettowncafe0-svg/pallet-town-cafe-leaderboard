import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaVersion } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    let value: string | null | undefined;
    if (type === "player" || type === "category") {
      const id = params.get("id");
      if (!id) return failure("Missing image id", 400);
      const record = type === "player"
        ? await db.player.findUnique({ where: { id }, select: { image: true } })
        : await db.category.findUnique({ where: { id }, select: { image: true } });
      value = record?.image;
    } else if (type === "setting") {
      const key = params.get("key");
      if (!key || !["background", "logo", "pokecompare_art"].includes(key)) {
        return failure("Invalid setting", 400);
      }
      value = (await db.setting.findUnique({ where: { key }, select: { value: true } }))?.value;
    } else {
      return failure("Invalid media type", 400);
    }
    if (!value) return failure("Image not found", 404);

    const version = mediaVersion(value);
    const requestedVersion = params.get("v");
    // Never cache new bytes under an old content version.
    if (requestedVersion && requestedVersion !== version) return failure("Image version changed", 404);
    if (/^https?:\/\//i.test(value)) {
      const response = NextResponse.redirect(value);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return failure("Invalid image", 400);
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) return failure("Invalid image", 400);
    const etag = `"${version}"`;
    const headers = {
      "Content-Type": match[1],
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "ETag": etag,
      "Vercel-CDN-Cache-Control": requestedVersion ? "public, max-age=86400" : "no-store",
      "Cache-Control": requestedVersion
        ? "public, max-age=86400, s-maxage=86400"
        : "no-cache",
    };
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
  } catch {
    return failure("Could not load media", 500);
  }
}
