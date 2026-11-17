import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import * as XLSX from "xlsx";
import { db } from "../lib/db";
import { applyPlan, fields, models, planImport, type Snapshot } from "../lib/import-plan";

// Export the real route, serialize/re-read the XLSX, then plan against the same
// database snapshot. Whole-second fixtures would miss the date regressions.
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
process.env.AUTH_SECRET = "synthetic-test-secret-at-least-32-characters";
let token: string;
Module._load = function(name: string, ...args: any[]) {
  if (name === "next/headers") return { cookies: async () => ({ get: () => ({ value: token }) }) };
  return originalLoad.call(this, name, ...args);
};
const { GET } = require("../app/api/export/route");
const dates = ["2026-09-17T20:43:06.000Z", "2026-09-19T17:46:17.962Z", "2026-09-17T21:00:09.234Z"].map(value => new Date(value));
const image = "data:image/png;base64,KEEP-UNCHANGED";
const players = ["Vinz", "Other"].map((name, index) => ({ id: `p${index}`, name, ign: name.toLowerCase(), points: index ? 0 : 10, bestPerformance: null, hallPokemon: index ? "[]" : null, active: true, createdAt: dates[0], updatedAt: dates[1], image }));
const category = { id: "c", name: "Mini Tournaments", description: null, image };
const rows: Record<string, any[]> = {
  player: players,
  category: [category],
  categoryRecord: players.map((player, index) => ({ id: `r${index}`, categoryId: "c", playerId: player.id, wins: index ? 0 : 3, losses: index ? 3 : 0, pokemon: index ? "[]" : null })),
  match: dates.map((playedAt, index) => ({ id: `m${index}`, categoryId: "c", winnerId: "p0", loserId: "p1", notes: null, playedAt })),
  pointTransaction: dates.map((createdAt, index) => ({ id: `t${index}`, playerId: "p0", categoryId: index ? null : "c", amount: 1, newTotal: index + 1, reason: null, action: "Award", actor: "Admin", createdAt })),
  setting: [
    { key: "pokecompare_highscores", value: JSON.stringify(dates.map((date, index) => ({ score: 73 - index, name: "Wren", note: `Note ${index}`, createdAt: date.toISOString() }))) },
    { key: "pokecompare_hide_details", value: "false" },
    { key: "pokecompare_art", value: image },
  ],
};
function project(row: any, args: any): any {
  const full = { ...row };
  if (row.categoryId) full.category = category;
  if (row.playerId) full.player = players.find(player => player.id === row.playerId);
  if (row.winnerId) full.winner = players.find(player => player.id === row.winnerId);
  if (row.loserId) full.loser = players.find(player => player.id === row.loserId);
  if (row.id === "c") full.records = rows.categoryRecord;
  return Object.fromEntries(Object.entries(args.select).map(([key, select]: any) => [key,
    select === true ? full[key] : Array.isArray(full[key]) ? full[key].map((item: any) => project(item, select)) : full[key] ? project(full[key], select) : null,
  ]));
}
for (const model of models) (db[model] as any).findMany = async (args: any) => rows[model].map(row => project(row, args));
(db.setting as any).findUnique = async ({ where }: any) => rows.setting.find(row => row.key === where.key) || null;
const before = Object.fromEntries(models.map(model => [model, rows[model].filter(row => model !== "setting" || row.key !== "pokecompare_art").map(row => Object.fromEntries(fields[model].map(field => [field, row[field]])))])) as Snapshot;
const serialize = (workbook: XLSX.WorkBook) => XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellDates: false });

async function main() {
  token = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const response = await GET();
  assert.equal(response.status, 200);
  const exported = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: false });
  for (const sheet of ["Match History", "Point History", "PokéCompare High Scores"]) {
    const data = XLSX.utils.sheet_to_json<any>(exported.Sheets[sheet]);
    assert.ok(data.every(row => typeof row.Date === "string" && row.Date.endsWith("Z")), "New dates export as exact ISO strings");
  }
  for (const legacy of [false, true]) for (const mode of ["merge", "replace"] as const) {
    const workbook = structuredClone(exported);
    if (legacy) for (const sheet of ["Match History", "Point History", "PokéCompare High Scores"]) {
      const data = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheet]);
      const converted = XLSX.utils.json_to_sheet(data);
      const headers = XLSX.utils.sheet_to_json<string[]>(converted, { header: 1 })[0];
      const column = headers.indexOf("Date");
      data.forEach((row, index) => {
        converted[XLSX.utils.encode_cell({ r: index + 1, c: column })] = { t: "n", v: (new Date(row.Date).getTime() - Date.UTC(1899, 11, 30)) / 86400000, z: "yyyy-mm-dd hh:mm:ss.000" };
      });
      workbook.Sheets[sheet] = converted;
    }
    const roundtrip = serialize(workbook);
    const noEdit = await planImport(before, roundtrip, mode, "roundtrip", dates[0].getTime());
    assert.deepEqual(noEdit.preview.changes, [], `Unedited backup: legacy=${legacy}, mode=${mode}`);
    const lifetime = roundtrip.Sheets["Lifetime Leaderboard"];
    const range = XLSX.utils.decode_range(lifetime["!ref"]!);
    for (let column = 0; column <= range.e.c; column++) if (lifetime[XLSX.utils.encode_cell({ r: 0, c: column })]?.v === "Lifetime Points") lifetime[XLSX.utils.encode_cell({ r: 1, c: column })].v++;
    const changed = await planImport(before, serialize(roundtrip), mode, "one-point", dates[0].getTime());
    assert.deepEqual(changed.preview.counts, { add: 0, change: 1, remove: 0 });
    assert.deepEqual(changed.preview.changes[0].fields, [{ field: "points", before: 10, after: 11 }]);
    assert.equal(changed.after.player[0].hallPokemon, null, "Original null survives in the actual write plan");
    assert.equal(changed.after.categoryRecord[0].pokemon, null);
    assert.deepEqual(changed.after.match.map(row => row.playedAt), before.match.map(row => row.playedAt));
    assert.deepEqual(changed.after.pointTransaction.map(row => row.createdAt), before.pointTransaction.map(row => row.createdAt));
    assert.equal(changed.after.setting[0].value, before.setting[0].value);
    const writes: unknown[] = [];
    await applyPlan({ player: { update: async (args: unknown) => { writes.push(args); } } } as any, changed);
    assert.deepEqual(writes, [{ where: { id: "p0" }, data: { points: 11 } }], "Apply updates only the edited point; no hidden normalization writes");
  }
  // Exact timestamp edits and clearing a populated lineup must remain real changes.
  const edits = structuredClone(exported);
  const matches = XLSX.utils.sheet_to_json<any>(edits.Sheets["Match History"]);
  matches[0].Date = new Date(dates[0].getTime() + 1).toISOString();
  edits.Sheets["Match History"] = XLSX.utils.json_to_sheet(matches);
  const exact = await planImport(before, serialize(edits), "merge", "edited-date", dates[0].getTime());
  assert.ok(exact.preview.changes.some(change => change.model === "match" && change.fields.some(field => field.field === "playedAt")));
  const populated = structuredClone(before); populated.player[0].hallPokemon = '["Pikachu"]';
  const clear = await planImport(populated, exported, "merge", "clear-lineup", dates[0].getTime());
  assert.ok(clear.preview.changes.some(change => change.fields.some(field => field.field === "hallPokemon" && field.after === "[]")));
  console.log("Backup round-trip passed: unedited = zero changes; +1 point = exactly one change, across ISO/legacy Excel dates, merge/replace, empty lineups and high-score timestamps. Real edits remain visible.");
}
main().finally(() => db.$disconnect());
