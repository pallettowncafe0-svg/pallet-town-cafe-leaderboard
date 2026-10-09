import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { SignJWT } from "jose";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { editedImage, mediaUrl, mediaVersion } from "../lib/media";

// Exercise the real routes with synthetic database records. Never connect to Supabase.
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let adminToken: string | undefined;
process.env.AUTH_SECRET = "synthetic-test-secret-at-least-32-characters";
Module._load = function(name: string, ...args: any[]) {
  if (name === "next/headers") return { cookies: async () => ({ get: () => adminToken ? { value: adminToken } : undefined }) };
  return originalLoad.call(this, name, ...args);
};
const { GET: dataGET } = require("../app/api/data/route");
const { GET: mediaGET } = require("../app/api/media/route");
const { POST: actionPOST } = require("../app/api/admin/action/route");
const { GET: exportGET } = require("../app/api/export/route");
const { POST: importPOST } = require("../app/api/import/route");
const { GET: healthGET } = require("../app/api/health/route");

const image = `data:image/png;base64,${Buffer.from("synthetic-image".repeat(100000)).toString("base64")}`;
const player = { id: "p1", name: "Test", ign: "test", active: true, points: 20, image, hallPokemon: "[]", createdAt: new Date(), updatedAt: new Date() };
const category = { id: "c1", name: "Board", image };
const record = { playerId: "p1", categoryId: "c1", player, wins: 2, losses: 1, pokemon: "[]" };
const transaction = { playerId: "p1", categoryId: "c1", player, category, amount: 20, createdAt: new Date() };
const match = { id: "match1", winner: player, loser: { ...player, id: "p2", name: "Other", ign: "other" }, category, playedAt: new Date() };
const settings: Record<string, string> = { background: image, logo: image, pokecompare_art: image, pokecompare_highscores: "[]", pokecompare_hide_details: "false" };
function project(value: any, args: any = {}): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(item => project(item, args));
  const result: any = args.select ? {} : {...value};
  for (const [key, selection] of Object.entries(args.select || args.include || {})) {
    if (selection === true) result[key] = value[key];
    else if (selection && typeof selection === "object") result[key] = project(value[key], selection);
  }
  return result;
}
(db.player as any).findMany = async (args: any) => project([player], args);
(db.category as any).findMany = async (args: any) => project([{ ...category, records: [record] }], args);
(db.pointTransaction as any).findMany = async (args: any) => project([transaction], args);
(db.match as any).findMany = async (args: any) => project([match], args);
(db as any).$queryRaw = async () => [
  ...[player, match.loser].map(p => ({type:"player",id:p.id,version:mediaVersion(p.image),url:null})),
  {type:"category",id:category.id,version:mediaVersion(category.image),url:null},
  ...["background","logo","pokecompare_art"].map(id=>({type:"setting",id,version:mediaVersion(image),url:null})),
];
(db.setting as any).findUnique = async ({ where }: any) => settings[where.key] ? { value: settings[where.key] } : null;
(db.player as any).findUnique = async ({ where }: any) => where.id === "p1" ? player : null;
(db.category as any).findUnique = async ({ where }: any) => where.id === "c1" ? category : null;

async function main() {
  let observedDBBytes = 0;
  for (const model of ["player","category","pointTransaction","match"]) {
    const delegate = (db as any)[model];
    const original = delegate.findMany;
    delegate.findMany = async (args: any) => {
      const rows = await original(args);
      const json = JSON.stringify(rows);
      assert.ok(!json.includes("data:image/"), `${model} queries must exclude image bytes at source`);
      observedDBBytes += Buffer.byteLength(json);
      return rows;
    };
  }
  const response = await dataGET();
  // Restore delegates before testing Excel, which intentionally fetches original images.
  (db.player as any).findMany = async (args: any) => project([player],args);
  (db.category as any).findMany = async (args: any) => project([{...category,records:[record]}],args);
  (db.pointTransaction as any).findMany = async (args: any) => project([transaction],args);
  (db.match as any).findMany = async (args: any) => project([match],args);
  const text = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!text.includes("data:image/"), "No nested base64 images in /api/data");
  const payload = JSON.parse(text);
  const urls = [payload.players[0].imageUrl, payload.categories[0].image,
    payload.categories[0].records[0].player.imageUrl, payload.categories[0].pointLeaderboard[0].player.imageUrl,
    payload.history[0].player.imageUrl, payload.history[0].category.image,
    payload.matches[0].winner.imageUrl, payload.matches[0].category.image,
    payload.background, payload.logo, payload.pokeCompareArt];
  for (const url of urls) {
    const parsed = new URL(url, "http://localhost");
    assert.equal(parsed.searchParams.get("v"), mediaVersion(image));
    const media = await mediaGET(new NextRequest(parsed));
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), "image/png");
    assert.equal(media.headers.get("cache-control"), "public, max-age=86400, s-maxage=86400");
    assert.equal(Buffer.from(await media.arrayBuffer()).toString(), Buffer.from(image.split(",")[1], "base64").toString());
  }
  const getMedia = (url: string, headers?: Record<string,string>) => mediaGET(new NextRequest(new URL(url, "http://localhost"), { headers }));
  assert.equal((await getMedia(urls[0], { "if-none-match": `"${mediaVersion(image)}"` })).status, 304);
  assert.equal((await getMedia("/api/media?type=player&id=missing")).status, 404);
  assert.equal((await getMedia("/api/media?type=player")).status, 400);
  assert.equal((await getMedia("/api/media?type=setting&key=private")).status, 400);
  assert.equal((await getMedia("/api/media?type=player&id=p1")).headers.get("cache-control"), "no-cache");
  player.image = "data:image/png;base64,bmV3";
  const changedURL = mediaUrl("/api/media?type=player&id=p1", player.image)!;
  assert.notEqual(changedURL, urls[0]);
  const stale = await getMedia(urls[0]);
  assert.equal(stale.status, 404);
  assert.equal(stale.headers.get("cache-control"), "no-store");
  assert.equal((await getMedia(changedURL)).status, 200);
  player.image = "https://example.com/picture.png";
  assert.equal(mediaUrl("/api/media?type=player&id=p1", player.image), player.image);
  const redirect = await getMedia("/api/media?type=player&id=p1");
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), player.image);
  player.image = "invalid";
  assert.equal((await getMedia("/api/media?type=player&id=p1")).status, 400);
  assert.equal(editedImage(undefined, image), image);
  assert.equal(editedImage("", image), image);
  assert.equal(editedImage(urls[0], image), image);
  assert.equal(editedImage(null, image), null);
  assert.equal(editedImage("https://example.com/new.png", image), "https://example.com/new.png");
  assert.equal(editedImage("data:image/png;base64,bmV3", image), "data:image/png;base64,bmV3");
  assert.throws(() => editedImage("javascript:alert(1)", image));
  // Ensure anonymous callers cannot mutate or run the destructive Excel import.
  const denied = await actionPOST(new NextRequest("http://localhost/api/admin/action", {method:"POST",body:JSON.stringify({action:"player.update",payload:{id:"p1"}})}));
  assert.equal(denied.status, 401);
  assert.notEqual((await exportGET()).status, 200);
  assert.notEqual((await importPOST(new NextRequest("http://localhost/api/import", {method:"POST"}))).status, 200);
  player.image = image;
  adminToken = await new SignJWT({role:"admin"}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  let savedImage: string | null | undefined;
  (db.category as any).findUniqueOrThrow = async () => category;
  (db.category as any).update = async ({data}: any) => { savedImage = data.image; return {...category,...data}; };
  const edit = await actionPOST(new NextRequest("http://localhost/api/admin/action", {method:"POST",body:JSON.stringify({action:"category.update",payload:{id:"c1",name:"Renamed",description:"Description"}})}));
  assert.equal(edit.status, 200);
  assert.equal(savedImage, image, "Editing category details preserves original image");
  (db.player as any).findMany = async () => [player, match.loser];
  (db.categoryRecord as any).findMany = async () => [{...record, category}];
  const excel = await exportGET();
  assert.equal(excel.status, 200);
  const excelBytes = await excel.arrayBuffer();
  const workbook = XLSX.read(excelBytes, {type:"array"});
  const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets["Lifetime Leaderboard"]);
  const pfp = Object.entries(rows[0]).filter(([key]) => key.startsWith("Profile Picture ")).map(([,value]) => value).join("");
  assert.equal(pfp, image, "Excel retains full original PFP in chunks");
  assert.ok(workbook.SheetNames.includes("Category Settings"));
  assert.ok(workbook.SheetNames.includes("PokéCompare Settings"));
  // Run the actual replacement importer against isolated in-memory delegates.
  // This verifies the workbook contract, not PostgreSQL transaction semantics.
  const imported: Record<string, any[]> = {};
  const tx: Record<string, any> = {};
  for (const model of ["player","category","categoryRecord","match","pointTransaction","setting"]) {
    const items = imported[model] = [];
    const matchesWhere = (item: any, where: any) => Object.entries(where || {}).every(([key,value]) => typeof value === "object" && value !== null ? matchesWhere(item,value) : item[key] === value);
    tx[model] = {
      deleteMany: async ({where}: any = {}) => { for(let i=items.length-1;i>=0;i--) if(matchesWhere(items[i],where)) items.splice(i,1); return {count:0}; },
      findMany: async ({where}: any = {}) => items.filter(item => matchesWhere(item,where)),
      create: async ({data}: any) => { const item={id:`${model}-${items.length}`,points:0,wins:0,losses:0,...data};items.push(item);return item; },
      update: async ({where,data}: any) => { const item=items.find(item=>matchesWhere(item,where));assert.ok(item);Object.assign(item,data);return item; },
      upsert: async ({where,create,update}: any) => { const actual=where.categoryId_playerId || where; const item=items.find(item=>matchesWhere(item,actual));if(item){Object.assign(item,update);return item;}return tx[model].create({data:create}); },
    };
  }
  (db as any).$transaction = async (callback: any) => callback(tx);
  const form = new FormData();
  form.set("file",new File([excelBytes],"backup.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const restored = await importPOST(new NextRequest("http://localhost/api/import",{method:"POST",body:form}));
  assert.equal(restored.status,200,await restored.text());
  assert.equal(imported.player.length,2);
  assert.equal(imported.player.find(p=>p.name==="Test").image,image);
  assert.equal(imported.category[0].image,image);
  assert.equal(imported.match.length,1);
  assert.equal(imported.pointTransaction.length,1);
  assert.equal(imported.setting.find(s=>s.key==="pokecompare_art").value,image);
  (db as any).$queryRaw = async () => [{value:1}];
  assert.equal((await healthGET()).status,200);
  (db as any).$queryRaw = async () => { throw new Error("unavailable"); };
  const unhealthy = await healthGET();
  assert.equal(unhealthy.status,503);
  assert.equal(unhealthy.headers.get("cache-control"),"no-store");
  assert.deepEqual(await unhealthy.json(),{ok:false});
  console.log(`Media/data and Excel round-trip regressions passed; synthetic /api/data: ${Buffer.byteLength(text)} bytes; queried record data: ${observedDBBytes} bytes with ${Buffer.byteLength(image)}-byte source images.`);
}
main().finally(() => db.$disconnect());
