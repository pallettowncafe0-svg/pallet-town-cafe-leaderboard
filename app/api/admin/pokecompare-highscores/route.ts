import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
const KEY = "pokecompare_highscores";
const MAX_SCORES = 10;

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, max);
}

function loadScores(value: string | null | undefined) {
  if (!value) return [] as Array<{ score: number; name: string; note: string; createdAt: string }>;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && Number.isInteger(Number(entry.score)) && Number(entry.score) > 0)
      .map((entry) => ({
        score: Number(entry.score),
        name: clean(entry.name, 16),
        note: clean(entry.note, 24),
        createdAt: String(entry.createdAt || new Date().toISOString()),
      }))
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
      .slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const action = body?.action;
    const index = Number(body?.index);

    if (!Number.isInteger(index) || index < 0 || index >= MAX_SCORES) {
      throw new Error("Invalid high-score entry.");
    }

    const setting = await db.setting.findUnique({ where: { key: KEY } });
    const scores = loadScores(setting?.value);
    if (!scores[index]) throw new Error("High-score entry not found.");

    if (action === "edit") {
      const name = clean(body?.name, 16);
      const note = clean(body?.note, 24);
      if (!name) throw new Error("Name cannot be empty.");
      scores[index] = { ...scores[index], name, note };
    } else if (action === "remove") {
      scores.splice(index, 1);
    } else {
      throw new Error("Unknown high-score action.");
    }

    await db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(scores) },
      update: { value: JSON.stringify(scores) },
    });

    return NextResponse.json({ ok: true, scores });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update high score." },
      { status: 400 }
    );
  }
}
