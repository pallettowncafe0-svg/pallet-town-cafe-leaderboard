import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const pageSize = 10;
const person = { select: { id: true, name: true, ign: true } } as const;
const board = { select: { id: true, name: true } } as const;
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type") || "all";
    if (!["all", "points", "matches"].includes(type)) throw new Error("Invalid history type.");
    const q = (params.get("q") || "").trim().slice(0, 200);
    const offset = (key: string) => {
      const value = Number(params.get(key) || 0);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid history page.");
      return value;
    };
    const pointsOffset = offset("pointsOffset"), matchesOffset = offset("matchesOffset");
    const contains = { contains: q, mode: "insensitive" as const };
    const player = { OR: [{ name: contains }, { ign: contains }] };
    const number = /^[+-]?\d+$/.test(q) ? Number(q) : undefined;
    const validNumber = number !== undefined && Number.isSafeInteger(number) && number >= -2147483648 && number <= 2147483647;
    const pointsWhere: Prisma.PointTransactionWhereInput = q ? { OR: [
      { player }, { category: { name: contains } }, { reason: contains }, { action: contains }, { actor: contains },
      ...(validNumber ? [{ amount: number }, { newTotal: number }] : []),
    ] } : {};
    const matchWhere: Prisma.MatchWhereInput = q ? { OR: [
      { winner: player }, { loser: player }, { category: { name: contains } }, { notes: contains },
    ] } : {};
    const [points, matches] = await Promise.all([
      type === "matches" ? [] : db.pointTransaction.findMany({
        where: pointsWhere, skip: pointsOffset, take: pageSize + 1,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, playerId: true, categoryId: true, amount: true, newTotal: true, reason: true, action: true, actor: true, createdAt: true, player: person, category: board },
      }),
      type === "points" ? [] : db.match.findMany({
        where: matchWhere, skip: matchesOffset, take: pageSize + 1,
        orderBy: [{ playedAt: "desc" }, { id: "desc" }],
        select: { id: true, categoryId: true, winnerId: true, loserId: true, notes: true, playedAt: true, winner: person, loser: person, category: board },
      }),
    ]);
    return NextResponse.json({ items: points.slice(0, pageSize), matches: matches.slice(0, pageSize), hasMorePoints: points.length > pageSize, hasMoreMatches: matches.length > pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load history.";
    const invalid = message.startsWith("Invalid history");
    return NextResponse.json({ error: invalid ? message : "Could not load history. Try again." }, { status: invalid ? 400 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
