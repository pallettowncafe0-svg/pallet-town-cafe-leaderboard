import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { mediaVersion } from "../lib/media";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
process.env.AUTH_SECRET = "synthetic-test-secret-at-least-32-characters";
let token: string | undefined;
Module._load = function(name: string, ...args: any[]) {
  if (name === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
  return originalLoad.call(this, name, ...args);
};
const { GET: historyGET } = require("../app/api/history/route");
const { GET: loadingGET } = require("../app/api/loading/route");
const { POST: uploadPOST } = require("../app/api/admin/loading/route");
const { GET: mediaGET } = require("../app/api/media/route");
const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const image = `data:image/gif;base64,${gif.toString("base64")}`;
const settings: Record<string, string> = { loading_gif: image, loading_gif_blend: "true", background: "keep-background", logo: "keep-logo" };
const writes: string[] = [];
const person = (index: number) => ({ id: `p${index}`, name: index === 120 ? "Archived Player" : "Vinz", ign: index === 120 ? "oldign" : "vinz00640", image });
const points = Array.from({ length: 125 }, (_, index) => ({ id: `t${String(index).padStart(3, "0")}`, amount: index + 1, newTotal: index + 10, playerId: `p${index}`, categoryId: "c", player: person(index), category: { id: "c", name: "Mini Tournaments", image }, reason: "Award", action: "Points added", actor: "Admin", createdAt: new Date(Date.UTC(2026, 10, 17, 12) - index * 60000) }));
const matches = points.map((row, index) => ({ id: `m${index}`, winner: row.player, winnerId: row.playerId, loser: { name: "Opponent", ign: "opponent", image }, loserId: "opponent", categoryId: "c", category: row.category, notes: index === 120 ? "Older archive battle" : null, playedAt: row.createdAt }));
const matchesWhere = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
  if (key === "OR") return value.some((part: any) => matchesWhere(row, part));
  if (value && typeof value === "object" && "contains" in value) return String(row[key] || "").toLowerCase().includes(value.contains.toLowerCase());
  if (value && typeof value === "object") return row[key] && matchesWhere(row[key], value);
  return row[key] === value;
});
function project(row: any, select: any): any {
  assert.ok(!("image" in select), "No image columns in history queries");
  return Object.fromEntries(Object.entries(select).map(([key, value]: any) => [key, value === true ? row[key] : row[key] ? project(row[key], value.select) : null]));
}
let matchQueries = 0;
for (const [model, rows] of [["pointTransaction", points], ["match", matches]] as const) (db[model] as any).findMany = async (args: any) => {
  if (model === "match") matchQueries++;
  assert.equal(args.take, 11, "Only ten records and one lookahead are fetched");
  assert.equal(args.orderBy.length, 2, "Stable ordering includes the ID tie-break");
  return rows.filter(row => matchesWhere(row, args.where)).slice(args.skip, args.skip + args.take).map(row => project(row, args.select));
};
(db as any).$queryRaw = async (sql: TemplateStringsArray) => {
  assert.ok(sql.join("").includes("sha256"), "Hash GIF in database, not in the API response");
  return settings.loading_gif ? [{ type: "setting", id: "loading_gif", version: mediaVersion(settings.loading_gif), url: null }] : [];
};
(db.setting as any).findUnique = async ({ where }: any) => settings[where.key] === undefined ? null : { value: settings[where.key] };
(db as any).$transaction = async (callback: any) => callback({ setting: {
  upsert: async ({ where, create, update }: any) => { writes.push(where.key); settings[where.key] = settings[where.key] === undefined ? create.value : update.value; },
  deleteMany: async ({ where }: any) => { assert.equal(where.key, "loading_gif"); writes.push(where.key); delete settings[where.key]; },
} });
const history = (query = "") => historyGET(new NextRequest(`http://localhost/api/history?${query}`));
function upload(action: string, file?: File, blend = true) {
  const form = new FormData(); form.set("action", action); form.set("blend", String(blend));
  if (file) form.set("gif", file);
  return uploadPOST(new NextRequest("http://localhost/api/admin/loading", { method: "POST", body: form }));
}
async function main() {
  let response = await history();
  const page = await response.json();
  assert.equal(page.items.length, 10); assert.equal(page.matches.length, 10);
  assert.equal(page.items[0].id, "t000"); assert.equal(page.items[9].id, "t009");
  assert.equal(page.hasMorePoints, true); assert.equal(page.hasMoreMatches, true);
  assert.ok(!JSON.stringify(page).includes("data:image/"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await (await history("type=points&pointsOffset=10")).json()).items[0].id, "t010");
  const archive = await (await history("q=Archived")).json();
  assert.equal(archive.items[0].id, "t120"); assert.equal(archive.matches[0].id, "m120");
  assert.equal(archive.hasMorePoints, false);
  const queries = matchQueries;
  const numeric = await (await history("type=points&q=%2B125")).json();
  assert.ok(numeric.items.some((row: any) => row.amount === 125));
  assert.ok(numeric.items.some((row: any) => row.newTotal === 125));
  assert.equal(matchQueries, queries, "Points-only search does not query matches");
  assert.equal((await (await history("type=matches&q=oldign")).json()).matches[0].id, "m120");
  assert.equal((await (await history("q=no-such-player")).json()).items.length, 0);
  for (const query of ["type=invalid", "pointsOffset=-1", "matchesOffset=NaN"]) assert.equal((await history(query)).status, 400);
  let config = await (await loadingGET()).json();
  assert.ok(config.image.includes("key=loading_gif")); assert.ok(config.image.includes("v=")); assert.equal(config.blend, true);
  assert.ok(!JSON.stringify(config).includes("data:image/"));
  const media = await mediaGET(new NextRequest(`http://localhost${config.image}`));
  assert.equal(media.status, 200); assert.equal(media.headers.get("Content-Type"), "image/gif");
  assert.equal(media.headers.get("Cache-Control"), "public, max-age=86400, s-maxage=86400");
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), gif);
  assert.equal((await upload("save", new File([gif], "test.gif", { type: "image/gif" }))).status, 401);
  assert.equal(writes.length, 0);
  token = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  assert.equal((await upload("save", new File(["bad gif"], "bad.gif", { type: "image/gif" }))).status, 400);
  assert.equal((await upload("save", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.gif", { type: "image/gif" }))).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await upload("save", new File([gif], "valid.gif", { type: "image/gif" }), false)).status, 200);
  assert.equal(settings.loading_gif, image); assert.equal(settings.loading_gif_blend, "false");
  assert.equal((await upload("save", undefined, true)).status, 200);
  assert.equal(settings.loading_gif, image, "Appearance-only changes retain GIF bytes");
  assert.equal((await upload("remove")).status, 200);
  config = await (await loadingGET()).json(); assert.equal(config.image, null);
  assert.equal(settings.background, "keep-background"); assert.equal(settings.logo, "keep-logo");
  (db as any).$queryRaw = async () => { throw new Error("offline"); };
  assert.deepEqual(await (await loadingGET()).json(), { image: null, blend: true });
  console.log("Loading/history regressions passed: latest 10, pagination, search beyond 100 records, type filters, no embedded images, admin authorization, GIF validation/upload/removal, appearance and cached media.");
}
main().finally(() => db.$disconnect());
