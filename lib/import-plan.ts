import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { simulateWorkbook } from "./import-workbook";

// This allowlist is also used for database reads and writes. Media fields and
// unrelated settings cannot enter an import plan, even through a legacy workbook.
export const fields = {
  player: ["id", "name", "ign", "points", "bestPerformance", "hallPokemon", "active"],
  category: ["id", "name", "description"],
  categoryRecord: ["id", "categoryId", "playerId", "wins", "losses", "pokemon"],
  match: ["id", "categoryId", "winnerId", "loserId", "notes", "playedAt"],
  pointTransaction: ["id", "playerId", "categoryId", "amount", "newTotal", "reason", "action", "actor", "createdAt"],
  setting: ["key", "value"],
} as const;
export type Model = keyof typeof fields;
export type Entity = Record<string, any>;
export type Snapshot = Record<Model, Entity[]>;
export const models = Object.keys(fields) as Model[];
const settingKeys = ["pokecompare_highscores", "pokecompare_hide_details"];
const primary = (model: Model) => model === "setting" ? "key" : "id";
const allowed = (model: Model, row: Entity): Entity => Object.fromEntries(
  fields[model].filter(field => row[field] !== undefined).map(field => [field, row[field]])
);

export async function readSnapshot(tx: Prisma.TransactionClient): Promise<Snapshot> {
  const result = {} as Snapshot;
  for (const model of models) {
    result[model] = await (tx[model].findMany as Function)({
      select: Object.fromEntries(fields[model].map(field => [field, true])),
      ...(model === "setting" ? { where: { key: { in: settingKeys } } } : {}),
      orderBy: { [primary(model)]: "asc" },
    });
  }
  return result;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type Where = Record<string, any>;
type Delegate = {
  findMany(args?: { where?: Where; select?: Entity }): Promise<Entity[]>;
  create(args: { data: Entity }): Promise<Entity>;
  update(args: { where: Where; data: Entity }): Promise<Entity>;
  upsert(args: { where: Where; create: Entity; update: Entity }): Promise<Entity>;
  deleteMany(args?: { where?: Where }): Promise<{ count: number }>;
};
export type ImportMemory = Record<Model, Delegate>;

function memory(snapshot: Snapshot, seed: string) {
  const state: Snapshot = structuredClone(snapshot);
  const tx = {} as ImportMemory;
  let sequence = 0;
  const matches = (row: Entity, where: Where = {}): boolean => Object.entries(where).every(([key, value]) =>
    typeof value === "object" && value !== null ? matches(row, value) : row[key] === value
  );
  for (const model of models) {
    const rows = state[model];
    tx[model] = {
      async findMany({ where, select } = {}) {
        return rows.filter(row => matches(row, where)).map(row => select
          ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
      },
      async create({ data }) {
        let generatedId = "";
        if (model !== "setting" && !data.id) {
          do { generatedId = `import_${seed.slice(0, 20)}_${++sequence}`; }
          while (models.some(name => state[name].some(row => row.id === generatedId)));
        }
        const row = allowed(model, {
          ...(model === "player" ? { ign: null, points: 0, bestPerformance: null, hallPokemon: null, active: true } : {}),
          ...(model === "category" ? { description: null } : {}),
          ...(model === "categoryRecord" ? { wins: 0, losses: 0, pokemon: null } : {}),
          ...(model !== "setting" ? { id: generatedId } : {}),
          ...data,
        });
        if (rows.some(existing => existing[primary(model)] === row[primary(model)])) throw new Error(`Duplicate ${model} ID in workbook.`);
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const row = rows.find(row => matches(row, where));
        if (!row) throw new Error(`Cannot resolve ${model} for import.`);
        Object.assign(row, allowed(model, data));
        return { ...row };
      },
      async upsert({ where, create, update }) {
        const actual = where.categoryId_playerId || where;
        return rows.some(row => matches(row, actual))
          ? tx[model].update({ where: actual, data: update }) : tx[model].create({ data: create });
      },
      async deleteMany({ where } = {}) {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) { rows.splice(i, 1); count++; }
        return { count };
      },
    };
  }
  return { tx, state };
}

export type Change = {
  model: Model; id: string; label: string; action: "add" | "change" | "remove";
  fields: { field: string; before: unknown; after: unknown }[];
};
export type ImportPlan = { changes: Change[]; counts: Record<"add" | "change" | "remove", number>; warnings: string[]; sheets: string[] };

export async function planImport(before: Snapshot, workbook: XLSX.WorkBook, mode: "merge" | "replace", seed: string, reviewedAt: number) {
  const { tx, state: after } = memory(before, seed);
  const { warnings } = await simulateWorkbook(tx, workbook, mode, reviewedAt);
  // PostgreSQL constraints should never be discovered only after confirmation.
  for (const [model, field] of [["player", "ign"], ["category", "name"]] as const) {
    const seen = new Set<string>();
    for (const row of after[model]) if (row[field]) {
      if (seen.has(row[field])) throw new Error(`Duplicate ${field}: ${row[field]}. Fix the workbook before importing.`);
      seen.add(row[field]);
    }
  }
  const playerName = (id: string, state: Snapshot) => state.player.find(row => row.id === id)?.name || id;
  const categoryName = (id: string, state: Snapshot) => state.category.find(row => row.id === id)?.name || id;
  const label = (model: Model, row: Entity, state: Snapshot): string => {
    if (model === "player" || model === "category") return row.name;
    if (model === "match") return `${categoryName(row.categoryId, state)}: ${playerName(row.winnerId, state)} → ${playerName(row.loserId, state)} (${row.id})`;
    if (model === "setting") return row.key;
    return `${playerName(row.playerId, state)}${row.categoryId ? ` / ${categoryName(row.categoryId, state)}` : ""} (${row.id})`;
  };
  const changes: Change[] = [];
  for (const model of models) {
    const idField = primary(model);
    const old = new Map(before[model].map(row => [row[idField], row]));
    const next = new Map(after[model].map(row => [row[idField], row]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const previous = old.get(id), current = next.get(id);
      const changed = fields[model].filter(field => field !== idField && JSON.stringify(previous?.[field] ?? null) !== JSON.stringify(current?.[field] ?? null));
      if (previous && current && !changed.length) continue;
      const action = !previous ? "add" : !current ? "remove" : "change";
      changes.push({ model, id, label: label(model, current || previous!, current ? after : before), action,
        fields: changed.map(field => ({ field, before: previous?.[field] ?? null, after: current?.[field] ?? null })) });
    }
  }
  if (mode === "replace") warnings.unshift("Only selected match/point history sheets replace their histories. Players and categories absent from the file are kept.");
  warnings.unshift("All existing images and image settings are preserved. Image columns in older backups are ignored.");
  return { before, after, preview: { changes, counts: {
    add: changes.filter(change => change.action === "add").length,
    change: changes.filter(change => change.action === "change").length,
    remove: changes.filter(change => change.action === "remove").length,
  }, warnings, sheets: workbook.SheetNames } satisfies ImportPlan };
}

export async function applyPlan(tx: Prisma.TransactionClient, plan: Awaited<ReturnType<typeof planImport>>) {
  // Remove dependent histories first; preserve every player/category record.
  for (const model of ["match", "pointTransaction", "categoryRecord"] as const) {
    const ids = plan.preview.changes.filter(change => change.model === model && change.action === "remove").map(change => change.id);
    if (ids.length) await (tx[model].deleteMany as Function)({ where: { id: { in: ids } } });
  }
  for (const model of models) for (const change of plan.preview.changes.filter(change => change.model === model && change.action !== "remove")) {
    const idField = primary(model);
    const row = plan.after[model].find(row => row[idField] === change.id)!;
    const data = allowed(model, row);
    if (model === "setting" && !settingKeys.includes(data.key)) throw new Error("Unsupported import setting.");
    if (change.action === "add") await (tx[model].create as Function)({ data });
    else {
      const update = Object.fromEntries(change.fields.map(field => [field.field, data[field.field]]));
      await (tx[model].update as Function)({ where: { [idField]: change.id }, data: update });
    }
  }
}
