import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { rankPlayers, rankRecords } from "@/lib/rankings";
import crypto from "crypto";

function mediaUrl(path: string, value: string | null | undefined) {
  if (!value) return null;

  const hash = crypto
    .createHash("sha1")
    .update(value)
    .digest("hex")
    .slice(0, 12);

  return `${path}?v=${hash}`;
}

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

  const players = rankPlayers(rawPlayers).map(
    (player: any, index: number) => ({
      ...player,

      /*
       * Do NOT send the large base64 PFP through /api/data.
       * The actual image is served separately by /api/media.
       */
      image: undefined,

      imageUrl: player.image
        ? mediaUrl(`/api/media?type=player&id=${player.id}`, player.image)
        : null,

      hallPokemon: player.hallPokemon
        ? JSON.parse(player.hallPokemon)
        : [],

      rank: index + 1,
    })
  );

  const categories = rawCategories.map((category: any) => {
    const pointTotals = categoryTransactions
      .filter(
        (transaction: any) =>
          transaction.categoryId === category.id
      )
      .reduce(
        (totals: Map<string, number>, transaction: any) => {
          totals.set(
            transaction.playerId,
            (totals.get(transaction.playerId) || 0) +
              transaction.amount
          );

          return totals;
        },
        new Map<string, number>()
      );

    const pointLeaderboard = Array.from(pointTotals.entries())
      .map(([playerId, points]) => {
        const player = rawPlayers.find(
          (item: any) => item.id === playerId
        );

        if (!player) return null;

        return {
          player: {
            ...player,
            image: undefined,
            imageUrl: player.image
              ? mediaUrl(
                  `/api/media?type=player&id=${player.id}`,
                  player.image
                )
              : null,
          },
          playerId,
          points,
        };
      })
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          b.points - a.points
      )
      .map((entry: any, index: number) => ({
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

        const recordPlayer = record.player
          ? {
              ...record.player,
              image: undefined,
              imageUrl: record.player.image
                ? mediaUrl(
                    `/api/media?type=player&id=${record.player.id}`,
                    record.player.image
                  )
                : null,
            }
          : record.player;

        return {
          ...record,
          player: recordPlayer,

          rank: index + 1,

          winRate:
            record.wins + record.losses
              ? Math.round(
                  (record.wins /
                    (record.wins + record.losses)) *
                    100
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

      /*
       * Board images can also be large.
       * Serve them through /api/media instead.
       */
      image: category.image
        ? mediaUrl(
            `/api/media?type=category&id=${category.id}`,
            category.image
          )
        : null,

      records,
      pointLeaderboard,
    };
  });

  let parsedHighScores: any[] = [];

  if (pokeCompareHighScores?.value) {
    try {
      const value = JSON.parse(
        pokeCompareHighScores.value
      );

      parsedHighScores = Array.isArray(value)
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
        JSON.parse(pokeComparePrivacy.value) === true;
    } catch {
      hideHighScoreDetails =
        pokeComparePrivacy.value === "true";
    }
  }

  const response = NextResponse.json({
    players,
    categories,
    history,
    matches,

    background: background?.value
      ? mediaUrl(
          "/api/media?type=setting&key=background",
          background.value
        )
      : null,

    logo: logo?.value
      ? mediaUrl(
          "/api/media?type=setting&key=logo",
          logo.value
        )
      : null,

    pokeCompareHighScores: parsedHighScores,

    pokeCompareArt: pokeCompareArt?.value
      ? mediaUrl(
          "/api/media?type=setting&key=pokecompare_art",
          pokeCompareArt.value
        )
      : null,

    pokeCompareHideDetails:
      hideHighScoreDetails,

    isAdmin: await isAdmin(),
  });

  /*
   * Keep the main JSON response uncached for now.
   * It is now small because images are no longer embedded.
   */
  response.headers.set(
    "Cache-Control",
    "no-store"
  );

  return response;
}
