import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { rankPlayers, rankRecords } from "@/lib/rankings";

export const runtime = "nodejs";

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
      where: {
        active: true,
      },
      select: {
        id: true,
        name: true,
        ign: true,
        points: true,
        bestPerformance: true,
        notes: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        image: true,
        hallPokemon: true,
      },
    }),

    db.category.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        createdAt: true,
        records: {
          where: {
            player: {
              active: true,
            },
          },
          select: {
            id: true,
            categoryId: true,
            playerId: true,
            wins: true,
            losses: true,
            pokemon: true,
            player: {
              select: {
                id: true,
                name: true,
                ign: true,
                points: true,
                bestPerformance: true,
                notes: true,
                active: true,
                createdAt: true,
                updatedAt: true,
                hallPokemon: true,
              },
            },
          },
        },
      },
    }),

    db.pointTransaction.findMany({
      select: {
        id: true,
        playerId: true,
        amount: true,
        newTotal: true,
        reason: true,
        action: true,
        actor: true,
        createdAt: true,
        categoryId: true,
        player: {
          select: {
            id: true,
            name: true,
            ign: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),

    db.match.findMany({
      select: {
        id: true,
        categoryId: true,
        winnerId: true,
        loserId: true,
        notes: true,
        playedAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        winner: {
          select: {
            id: true,
            name: true,
            ign: true,
          },
        },
        loser: {
          select: {
            id: true,
            name: true,
            ign: true,
          },
        },
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
      select: {
        value: true,
      },
    }),

    db.setting.findUnique({
      where: {
        key: "logo",
      },
      select: {
        value: true,
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_highscores",
      },
      select: {
        value: true,
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_art",
      },
      select: {
        value: true,
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_hide_details",
      },
      select: {
        value: true,
      },
    }),

    db.pointTransaction.findMany({
      where: {
        categoryId: {
          not: null,
        },
      },
      select: {
        categoryId: true,
        playerId: true,
        amount: true,
      },
    }),
  ]);

  const players = rankPlayers(rawPlayers).map(
    (player: any, index) => ({
      ...player,
      hallPokemon: player.hallPokemon
        ? JSON.parse(player.hallPokemon)
        : [],
      rank: index + 1,
    })
  );

  const categories = rawCategories.map(
    (category: any) => {
      const pointTotals =
        categoryTransactions
          .filter(
            (transaction: any) =>
              transaction.categoryId === category.id
          )
          .reduce(
            (
              totals: Map<string, number>,
              transaction: any
            ) => {
              totals.set(
                transaction.playerId,
                (totals.get(transaction.playerId) || 0) +
                  transaction.amount
              );

              return totals;
            },
            new Map<string, number>()
          );

      const pointLeaderboard =
        Array.from(
          pointTotals.entries()
        )
          .map(
            ([playerId, points]) => {
              const player =
                rawPlayers.find(
                  (item: any) =>
                    item.id === playerId
                );

              return player
                ? {
                    player,
                    playerId,
                    points,
                  }
                : null;
            }
          )
          .filter(Boolean)
          .sort(
            (a: any, b: any) =>
              b.points - a.points
          )
          .map(
            (entry: any, index) => ({
              ...entry,
              rank: index + 1,
            })
          );

      const records =
        rankRecords(
          category.records
        ).map(
          (record: any, index: number) => {
            const categoryPoints =
              categoryTransactions
                .filter(
                  (transaction: any) =>
                    transaction.categoryId ===
                      category.id &&
                    transaction.playerId ===
                      record.playerId
                )
                .reduce(
                  (
                    total: number,
                    transaction: any
                  ) =>
                    total +
                    transaction.amount,
                  0
                );

            return {
              ...record,
              rank: index + 1,
              winRate:
                record.wins +
                  record.losses
                  ? Math.round(
                      (record.wins /
                        (record.wins +
                          record.losses)) *
                        100
                    )
                  : 0,
              pokemon: record.pokemon
                ? JSON.parse(
                    record.pokemon
                  )
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
    }
  );

  let parsedHighScores: any[] = [];

  if (pokeCompareHighScores?.value) {
    try {
      const value =
        JSON.parse(
          pokeCompareHighScores.value
        );

      parsedHighScores =
        Array.isArray(value)
          ? value.slice(0, 10)
          : [];
    } catch {
      parsedHighScores = [];
    }
  }

  let hideHighScoreDetails = false;

  if (pokeComparePrivacy?.value) {
    try {
      hideHighScoreDetails =
        JSON.parse(
          pokeComparePrivacy.value
        ) === true;
    } catch {
      hideHighScoreDetails =
        pokeComparePrivacy.value ===
        "true";
    }
  }

  return NextResponse.json(
    {
      players,
      categories,
      history,
      matches,
      background:
        background?.value || null,
      logo:
        logo?.value || null,
      pokeCompareHighScores:
        parsedHighScores,
      pokeCompareArt:
        pokeCompareArt?.value || null,
      pokeCompareHideDetails:
        hideHighScoreDetails,
      isAdmin: await isAdmin(),
    },
    {
      headers: {
        "Cache-Control":
          "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
