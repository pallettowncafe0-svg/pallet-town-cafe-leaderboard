import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
const KEY = "pokecompare_hide_details";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const hideDetails = body?.hideDetails === true;

    await db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(hideDetails) },
      update: { value: JSON.stringify(hideDetails) },
    });

    return NextResponse.json({ ok: true, hideDetails });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update setting." },
      { status: 400 }
    );
  }
}
