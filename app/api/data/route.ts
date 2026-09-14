import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { rankPlayers, rankRecords } from "@/lib/rankings";

export async function GET() {
  const [
    rawPlayers,
    rawCategories,
    history,
    matches,
    background,
    logo,
    pokeCompareHighScores,
    pokeCompareArt,
    pokeComparePrivacy,
    categoryTransactions,
  ] = await Promise.all([
    db.player.findMany({
      where: { active: true },
    }),

    db.category.findMany({
      include: {
        records: {
          where: {
            player: {
              active: true,
            },
          },
          include: {
            player: true,
          },
        },
      },
    }),

    db.pointTransaction.findMany({
      include: {
        player: true,
        category: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),

    db.match.findMany({
      include: {
        category: true,
        winner: true,
        loser: true,
      },
      orderBy: {
        playedAt: "desc",
      },
      take: 100,
    }),

    db.setting.findUnique({
      where: {
        key: "background",
      },
    }),

    db.setting.findUnique({
      where: {
        key: "logo",
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_highscores",
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_art",
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_hide_details",
      },
    }),

    db.pointTransaction.findMany({
      where: {
        categoryId: {
          not: null,
        },
      },
    }),
  ]);

  const players = rankPlayers(rawPlayers).map((player: any, index) => ({
    ...player,
    hallPokemon: player.hallPokemon
      ? JSON.parse(player.hallPokemon)
      : [],
    rank: index + 1,
  }));

  const categories = rawCategories.map((category: any) => {
    const pointTotals = categoryTransactions
      .filter(
        (transaction: any) => transaction.categoryId === category.id
      )
      .reduce((totals: Map<string, number>, transaction: any) => {
        totals.set(
          transaction.playerId,
          (totals.get(transaction.playerId) || 0) + transaction.amount
        );

        return totals;
      }, new Map<string, number>());

    const pointLeaderboard = Array.from(pointTotals.entries())
      .map(([playerId, points]) => {
        const player = rawPlayers.find(
          (item: any) => item.id === playerId
        );

        return player
          ? {
              player,
              playerId,
              points,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.points - a.points)
      .map((entry: any, index) => ({
        ...entry,
        rank: index + 1,
      }));

    const records = rankRecords(category.records).map(
      (record: any, index: number) => {
        const categoryPoints = categoryTransactions
          .filter(
            (transaction: any) =>
              transaction.categoryId === category.id &&
              transaction.playerId === record.playerId
          )
          .reduce(
            (total: number, transaction: any) =>
              total + transaction.amount,
            0
          );

        return {
          ...record,
          rank: index + 1,
          winRate:
            record.wins + record.losses
              ? Math.round(
                  (record.wins / (record.wins + record.losses)) * 100
                )
              : 0,
          pokemon: record.pokemon
            ? JSON.parse(record.pokemon)
            : [],
          categoryPoints,
        };
      }
    );

    return {
      ...category,
      records,
      pointLeaderboard,
    };
  });

  let parsedHighScores: any[] = [];
  if (pokeCompareHighScores?.value) {
    try {
      const value = JSON.parse(pokeCompareHighScores.value);
      parsedHighScores = Array.isArray(value) ? value.slice(0, 10) : [];
    } catch {
      parsedHighScores = [];
    }
  }

  let hideHighScoreDetails = false;
  if (pokeComparePrivacy?.value) {
    try { hideHighScoreDetails = JSON.parse(pokeComparePrivacy.value) === true; } catch { hideHighScoreDetails = pokeComparePrivacy.value === "true"; }
  }

  return NextResponse.json({
    players,
    categories,
    history,
    matches,
    background: background?.value || null,
    logo: logo?.value || null,
    pokeCompareHighScores: parsedHighScores,
    pokeCompareArt: pokeCompareArt?.value || null,
    pokeCompareHideDetails: hideHighScoreDetails,
    isAdmin: await isAdmin(),
  });
}
