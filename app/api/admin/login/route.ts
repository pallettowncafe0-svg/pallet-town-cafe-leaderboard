import { NextRequest, NextResponse } from "next/server";
import { grantAdmin, verifyPassword } from "@/lib/auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (typeof password !== "string" || !(await verifyPassword(password))) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
      return NextResponse.json({ error: "Admin login configuration needs an AUTH_SECRET of at least 32 characters." }, { status: 503 });
    }
    await grantAdmin();
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[PTC LOGIN] Unable to create admin session; check server authentication configuration.");
    return NextResponse.json({ error: "Could not create admin session. Check the server login configuration." }, { status: 500 });
  }
}
