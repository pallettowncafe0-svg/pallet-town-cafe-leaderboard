import { NextResponse } from "next/server";
import { loadingConfig } from "@/lib/loading";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await loadingConfig(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // An unavailable optional GIF must never block the leaderboard.
    return NextResponse.json({ image: null, blend: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
