import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const form = await request.formData();
    const action = form.get("action");
    if (action !== "save" && action !== "remove") throw new Error("Choose a valid loading screen action.");
    const file = form.get("gif");
    let value: string | undefined;
    if (action === "save" && file instanceof File && file.size) {
      if (file.size > 2 * 1024 * 1024) throw new Error("Loading GIF must be 2 MB or smaller.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (file.type !== "image/gif" || bytes.length < 13 || !["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) throw new Error("Upload a valid GIF file.");
      value = `data:image/gif;base64,${bytes.toString("base64")}`;
    }
    await db.$transaction(async tx => {
      if (action === "remove") await tx.setting.deleteMany({ where: { key: "loading_gif" } });
      else {
        if (value !== undefined) await tx.setting.upsert({ where: { key: "loading_gif" }, create: { key: "loading_gif", value }, update: { value } });
        const blend = form.get("blend") === "true" ? "true" : "false";
        await tx.setting.upsert({ where: { key: "loading_gif_blend" }, create: { key: "loading_gif_blend", value: blend }, update: { value: blend } });
      }
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save loading GIF.";
    return NextResponse.json({ error: message }, { status: message === "Admin authorization required" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
