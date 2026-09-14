import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  (await cookies()).delete("ptc_admin");
  return NextResponse.json({ ok: true });
}
