import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
      .filter((entry) => entry && Number.isInteger(Number(entry.score)) && Number(entry.score) > 0 && clean(entry.name, 16))
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

export async function GET() {
  const setting = await db.setting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ scores: loadScores(setting?.value) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const score = Math.trunc(Number(body?.score));
    const name = clean(body?.name, 16);
    const note = clean(body?.note, 24);

    if (!Number.isInteger(score) || score < 1 || score > 9999) {
      return NextResponse.json({ error: "Invalid high score." }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Enter a name or initials." }, { status: 400 });
    }

    const setting = await db.setting.findUnique({ where: { key: KEY } });
    const scores = loadScores(setting?.value);
    const qualifies = scores.length < MAX_SCORES || score > scores[MAX_SCORES - 1].score;

    if (!qualifies) {
      return NextResponse.json({ scores, qualified: false });
    }

    scores.push({
      score,
      name,
      note,
      createdAt: new Date().toISOString(),
    });

    scores.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    const nextScores = scores.slice(0, MAX_SCORES);

    await db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(nextScores) },
      update: { value: JSON.stringify(nextScores) },
    });

    return NextResponse.json({ scores: nextScores, qualified: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save high score." },
      { status: 400 }
    );
  }
}
