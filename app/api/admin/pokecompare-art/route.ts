import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
const KEY = "pokecompare_art";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const value = typeof body?.value === "string" ? body.value : "";

    if (!value.startsWith("data:image/")) {
      throw new Error("Choose an image file.");
    }

    if (value.length > 4_000_000) {
      throw new Error("Artwork is too large. Use an image under about 3 MB.");
    }

    await db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save artwork." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await db.setting.deleteMany({ where: { key: KEY } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove artwork." },
      { status: 400 }
    );
  }
}
