import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import * as XLSX from "xlsx";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { applyPlan, fields, models, planImport, readSnapshot, type Snapshot } from "../lib/import-plan";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let adminToken: string | undefined;
process.env.AUTH_SECRET = "synthetic-test-secret-at-least-32-characters";
Module._load = function(name: string, ...args: any[]) {
  if (name === "next/headers") return { cookies: async () => ({ get: () => adminToken ? { value: adminToken } : undefined }) };
  return originalLoad.call(this, name, ...args);
};
const { POST } = require("../app/api/import/route");
const image = "data:image/png;base64,KEEP-EXACTLY";
const now = new Date("2026-11-17T12:00:00Z");
const fixture = {
  player: [
    { id: "p1", name: "Test", ign: "test", points: 10, active: true, bestPerformance: null, hallPokemon: "[]", image },
    { id: "p2", name: "Other", ign: "other", points: 0, active: true, bestPerformance: null, hallPokemon: null, image },
    { id: "p3", name: "Absent", ign: "absent", points: 5, active: true, bestPerformance: null, hallPokemon: null, image },
  ],
  category: [{ id: "c1", name: "Board", description: null, image }],
  categoryRecord: [{ id: "r1", categoryId: "c1", playerId: "p1", wins: 1, losses: 0, pokemon: "[]" }],
  match: [{ id: "m-old", categoryId: "c1", winnerId: "p1", loserId: "p2", notes: null, playedAt: now }],
  pointTransaction: [{ id: "t-old", playerId: "p1", categoryId: "c1", amount: 10, newTotal: 10, reason: null, action: "Award", actor: "Admin", createdAt: now }],
  setting: [
    { key: "pokecompare_highscores", value: "[]" }, { key: "pokecompare_hide_details", value: "false" },
    ...["pokecompare_art", "background", "logo", "future_image_setting", "loading_gif", "loading_gif_blend"].map(key => ({ key, value: image })),
  ],
};
let live = structuredClone(fixture);
let writes = 0;
function fakeTx() {
  const tx: any = {};
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: any) => value && typeof value === "object" ? value.in.includes(row[key]) : row[key] === value);
  for (const model of models) tx[model] = {
    findMany: async (args: any = {}) => {
      assert.ok(args.select, `Read ${model} requires a projection`);
      assert.ok(!("image" in args.select));
      if (model === "setting") assert.deepEqual(args.where.key.in, ["pokecompare_highscores", "pokecompare_hide_details"]);
      return live[model].filter(row => matches(row, args.where)).sort((a: any, b: any) => String(a.id || a.key).localeCompare(String(b.id || b.key))).map(row => Object.fromEntries(Object.keys(args.select).map(key => [key, (row as any)[key]])));
    },
    create: async ({ data }: any) => { writes++; checkData(model, data); (live[model] as any[]).push(data); return data; },
    update: async ({ where, data }: any) => { writes++; checkData(model, data); const row = live[model].find(row => matches(row, where)); assert.ok(row); Object.assign(row, data); return row; },
    deleteMany: async ({ where }: any) => {
      writes++; assert.ok(model !== "player" && model !== "category" && model !== "setting");
      const rows = live[model] as any[];
      for (let index = rows.length - 1; index >= 0; index--) if (matches(rows[index], where)) rows.splice(index, 1);
    },
  };
  return tx;
}
function checkData(model: keyof typeof fields, data: any) {
  for (const key of Object.keys(data)) assert.ok((fields[model] as readonly string[]).includes(key), `Unsupported write ${model}.${key}`);
  assert.ok(!("image" in data));
  if (model === "setting" && data.key) assert.ok(["pokecompare_highscores", "pokecompare_hide_details"].includes(data.key));
}
function workbook() {
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  sheet("Lifetime Leaderboard", [{ "Player ID": "p1", "Full Name": "Renamed", IGN: "test", "Lifetime Points": 25, "Profile Picture 1": "data:image/png;base64,REPLACE" }]);
  sheet("Category Settings", [{ "Category ID": "c1", Category: "Board", Description: "New description", "Image 1": "" }]);
  sheet("Match History", [{ "Match ID": "m-new", Category: "Board", Winner: "test", Loser: "other", Date: now }]);
  sheet("Point History", [{ "Transaction ID": "t-new", Player: "test", "Points Change": 15, "New Total": 25, Date: now }]);
  sheet("PokéCompare Settings", [{ "Artwork 1": "data:image/png;base64,REPLACE", "Hide High Score Details": "Yes" }]);
  return wb;
}
const request = (bytes: Buffer, action: string, token?: string, mode = "merge", sheets?: string[]) => {
  const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], "backup.xlsx"));
  form.set("action", action); form.set("mode", mode);
  if (token) form.set("token", token);
  if (sheets) form.set("sheets", JSON.stringify(sheets));
  return new NextRequest("http://localhost/api/import", { method: "POST", body: form });
};
async function main() {
  (db as any).$transaction = async (callback: any) => {
    const prior = structuredClone(live);
    try { return await callback(fakeTx()); } catch (error) { live = prior; throw error; }
  };
  const bytes = XLSX.write(workbook(), { type: "buffer", bookType: "xlsx" });
  assert.equal((await POST(request(bytes, "preview"))).status, 400, "Anonymous preview denied");
  adminToken = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  assert.equal((await POST(request(bytes, "apply"))).status, 400, "Cannot apply without preview");
  const previewResponse = await POST(request(bytes, "preview"));
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200, JSON.stringify(preview));
  assert.equal(writes, 0, "Preview performs no database writes");
  assert.ok(preview.changes.some((c: any) => c.label === "Renamed" && c.fields.some((f: any) => f.field === "points" && f.before === 10 && f.after === 25)));
  assert.equal(preview.counts.remove, 0, "Merge keeps existing histories");
  assert.ok(!JSON.stringify(preview).includes("data:image/"));
  assert.equal((await POST(request(bytes, "apply", preview.token, "replace"))).status, 400, "Changed options rejected");
  assert.equal((await POST(request(bytes, "apply", preview.token + "tampered"))).status, 400, "Tampered token rejected");
  live.player[0].points++;
  assert.equal((await POST(request(bytes, "apply", preview.token))).status, 400, "Stale preview rejected");
  live.player[0].points--;
  const applied = await POST(request(bytes, "apply", preview.token));
  assert.equal(applied.status, 200, await applied.text());
  assert.equal(live.player[0].points, 25);
  assert.equal(live.player[0].id, "p1");
  assert.equal(live.player.length, 3, "Absent players preserved");
  assert.equal(live.match.length, 2);
  assert.equal(live.pointTransaction.length, 2);
  for (const row of [...live.player, ...live.category]) assert.equal(row.image, image);
  for (const key of ["pokecompare_art", "background", "logo", "future_image_setting", "loading_gif", "loading_gif_blend"]) assert.equal(live.setting.find(row => row.key === key)?.value, image);
  const replacementResponse = await POST(request(bytes, "preview", undefined, "replace"));
  const replacement = await replacementResponse.json();
  assert.equal(replacement.counts.remove, 2);
  assert.deepEqual(replacement.changes.filter((c: any) => c.action === "remove").map((c: any) => c.id).sort(), ["m-old", "t-old"]);
  assert.equal((await POST(request(bytes, "apply", replacement.token, "replace"))).status, 200);
  assert.equal(live.match.length, 1);
  assert.equal(live.pointTransaction.length, 1);
  // Selected empty sheets can intentionally clear histories; unrelated sheets survive.
  const empty = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([["Match ID", "Category", "Winner", "Loser"]]), "Match History");
  const snapshot = await readSnapshot(fakeTx());
  const clear = await planImport(snapshot, empty, "replace", "empty", now.getTime());
  assert.ok(clear.preview.changes.some(change => change.model === "match" && change.action === "remove"));
  assert.ok(!clear.preview.changes.some(change => change.model === "pointTransaction"));
  const onlySettings = await POST(request(bytes, "preview", undefined, "replace", ["PokéCompare Settings"]));
  assert.equal((await onlySettings.json()).counts.remove, 0);
  // ID-less matches receive deterministic IDs for confirmation and fresh IDs on later imports.
  const noId = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(noId, XLSX.utils.json_to_sheet([{ Category: "Board", Winner: "test", Loser: "other" }]), "Match History");
  const first = await planImport(snapshot, noId, "merge", "same-seed", now.getTime());
  const again = await planImport(snapshot, noId, "merge", "same-seed", now.getTime());
  assert.deepEqual(first.preview, again.preview);
  const second = await planImport(first.after, noId, "merge", "same-seed", now.getTime());
  assert.equal(second.preview.counts.add, 1);
  // Exercise the supplied 8.7 MB legacy workbook when available, without touching Supabase.
  if (process.argv[2]) {
    const legacy = XLSX.read(readFileSync(process.argv[2]), { type: "buffer", cellDates: true });
    const legacyPlan = await planImport(snapshot, legacy, "replace", "legacy", now.getTime());
    assert.ok(legacyPlan.preview.counts.add > 0);
    assert.ok(!JSON.stringify(legacyPlan).includes("data:image/"));
    const beforeImages = live.player.map(row => row.image);
    await applyPlan(fakeTx(), legacyPlan);
    assert.deepEqual(live.player.slice(0, beforeImages.length).map(row => row.image), beforeImages);
    assert.equal(live.category[0].image, image);
    console.log(`Legacy workbook: ${legacyPlan.preview.counts.add} additions, ${legacyPlan.preview.counts.change} changes, ${legacyPlan.preview.counts.remove} removals; no image reads or writes.`);
  }
  console.log("Import regressions passed: read-only preview, field diffs, merge/replace, selected/empty sheets, confirmation binding, stale protection, IDs and all image preservation.");
}
main().finally(() => db.$disconnect());
