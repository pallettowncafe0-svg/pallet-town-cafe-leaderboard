import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } =
      new URL(request.url);

    const type = searchParams.get("type");

    if (type === "player") {
      const id = searchParams.get("id");

      if (!id) {
        return new NextResponse(
          "Missing player id",
          { status: 400 }
        );
      }

      const player = await db.player.findUnique({
        where: { id },
        select: {
          image: true,
        },
      });

      if (!player?.image) {
        return new NextResponse(
          "Image not found",
          { status: 404 }
        );
      }

      return imageResponse(player.image);
    }

    if (type === "category") {
      const id = searchParams.get("id");

      if (!id) {
        return new NextResponse(
          "Missing category id",
          { status: 400 }
        );
      }

      const category =
        await db.category.findUnique({
          where: { id },
          select: {
            image: true,
          },
        });

      if (!category?.image) {
        return new NextResponse(
          "Image not found",
          { status: 404 }
        );
      }

      return imageResponse(category.image);
    }

    if (type === "setting") {
      const key = searchParams.get("key");

      if (!key) {
        return new NextResponse(
          "Missing setting key",
          { status: 400 }
        );
      }

      const allowedKeys = [
        "background",
        "logo",
        "pokecompare_art",
      ];

      if (!allowedKeys.includes(key)) {
        return new NextResponse(
          "Invalid setting",
          { status: 400 }
        );
      }

      const setting =
        await db.setting.findUnique({
          where: { key },
          select: {
            value: true,
          },
        });

      if (!setting?.value) {
        return new NextResponse(
          "Image not found",
          { status: 404 }
        );
      }

      return imageResponse(setting.value);
    }

    return new NextResponse(
      "Invalid media type",
      { status: 400 }
    );
  } catch {
    return new NextResponse(
      "Could not load media",
      { status: 500 }
    );
  }
}

function imageResponse(value: string) {
  const match = value.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    /*
     * Supports normal external image URLs too.
     */
    if (
      value.startsWith("https://") ||
      value.startsWith("http://")
    ) {
      return NextResponse.redirect(value);
    }

    return new NextResponse(
      "Invalid image",
      { status: 400 }
    );
  }

  const mimeType = match[1];
  const base64 = match[2];

  const buffer =
    Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,

      /*
       * Images are versioned by the hash in /api/data,
       * so long CDN caching is safe.
       */
      "Cache-Control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",

      "CDN-Cache-Control":
        "public, max-age=86400, stale-while-revalidate=604800",

      "Vercel-CDN-Cache-Control":
        "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}