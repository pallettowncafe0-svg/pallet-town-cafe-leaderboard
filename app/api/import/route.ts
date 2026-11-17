import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { applyPlan, digest, planImport, readSnapshot } from "@/lib/import-plan";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function secret() {
  const value = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? "development-only-secret-change-me-32chars" : "");
  if (value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an .xlsx backup file first.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) throw new Error("The selected Excel file is empty.");
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
    const allSheets = [...workbook.SheetNames];
    const selected = form.get("sheets");
    if (selected) {
      const sheets = JSON.parse(String(selected));
      if (!Array.isArray(sheets) || !sheets.length || sheets.some(sheet => typeof sheet !== "string" || !allSheets.includes(sheet))) throw new Error("Select at least one valid sheet.");
      workbook.SheetNames = allSheets.filter(sheet => sheets.includes(sheet));
    }
    const mode = form.get("mode") === "replace" ? "replace" : "merge";
    const action = form.get("action");
    if (action !== "preview" && action !== "apply") throw new Error("Preview the import before applying it.");
    let reviewedAt = Date.now();
    let expectedState: string | undefined;
    if (action === "apply") {
      const token = form.get("token");
      if (typeof token !== "string") throw new Error("Preview the import before applying it.");
      const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: "ptc-import", issuer: "ptc" });
      if (payload.fileHash !== fileHash || payload.mode !== mode || JSON.stringify(payload.sheets) !== JSON.stringify(workbook.SheetNames) || typeof payload.reviewedAt !== "number" || typeof payload.state !== "string") throw new Error("The file or import options changed. Generate a new preview.");
      reviewedAt = payload.reviewedAt;
      expectedState = payload.state;
    }
    const result = await db.$transaction(async tx => {
      const before = await readSnapshot(tx);
      const state = digest(before);
      if (expectedState && expectedState !== state) throw new Error("Site data changed since your preview. Generate a new preview to review the latest changes.");
      const plan = await planImport(before, workbook, mode, fileHash, reviewedAt);
      if (action === "apply") await applyPlan(tx, plan);
      return { state, preview: plan.preview };
    }, { maxWait: 10000, timeout: 120000, isolationLevel: action === "apply" ? "Serializable" : "RepeatableRead" });
    if (action === "preview") {
      const token = await new SignJWT({ fileHash, mode, sheets: workbook.SheetNames, state: result.state, reviewedAt })
        .setProtectedHeader({ alg: "HS256" }).setIssuer("ptc").setAudience("ptc-import").setExpirationTime("15m").sign(secret());
      return NextResponse.json({ ...result.preview, availableSheets: allSheets, token }, { headers });
    }
    const counts = result.preview.counts;
    return NextResponse.json({ ok: true, counts, message: `Import complete: ${counts.add} added, ${counts.change} changed, ${counts.remove} removed. All images preserved.` }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 400, headers });
  }
}

