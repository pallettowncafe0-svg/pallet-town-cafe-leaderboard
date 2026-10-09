import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { rankPlayers, rankRecords } from "@/lib/rankings";
import { getMediaMetadata, metadataMediaUrl, playerSelect, categorySelect } from "@/lib/leaderboard-data";

export async function GET() {
  const [
    rawPlayers,
    rawCategories,
    history,
    matches,
    pokeCompareHighScores,
    pokeComparePrivacy,
    categoryTransactions,
    mediaMetadata,
  ] = await Promise.all([
    db.player.findMany({
      where: { active: true },
      select: playerSelect,
    }),

    db.category.findMany({
      select: {
        ...categorySelect,
        records: {
          where: {
            player: {
              active: true,
            },
          },
          include: {
            player: { select: playerSelect },
          },
        },
      },
    }),

    db.pointTransaction.findMany({
      include: {
        player: { select: playerSelect },
        category: { select: categorySelect },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),

    db.match.findMany({
      include: {
        category: { select: categorySelect },
        winner: { select: playerSelect },
        loser: { select: playerSelect },
      },
      orderBy: {
        playedAt: "desc",
      },
      take: 100,
    }),


    db.setting.findUnique({
      where: {
        key: "pokecompare_highscores",
      },
    }),

    db.setting.findUnique({
      where: {
        key: "pokecompare_hide_details",
      },
    }),

    db.pointTransaction.findMany({
      select: { categoryId: true, playerId: true, amount: true },
      where: {
        categoryId: {
          not: null,
        },
      },
    }),
    getMediaMetadata(),
  ]);

  const mediaByKey = new Map(mediaMetadata.map(item => [`${item.type}:${item.id}`, item]));
  const imageURL = (type: string, id: string) => metadataMediaUrl(mediaByKey.get(`${type}:${id}`));
  const publicPlayer = (player: any) => ({
    ...player,
    image: mediaByKey.get(`player:${player.id}`)?.url || undefined,
    imageUrl: imageURL("player", player.id),
  });
  const publicCategory = (category: any) => ({ ...category, image: imageURL("category", category.id) });

  const players = rankPlayers(rawPlayers).map(
    (player: any, index: number) => ({
      ...publicPlayer(player),

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
          player: publicPlayer(player),
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

        const recordPlayer = record.player ? publicPlayer(record.player) : record.player;

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
      image: imageURL("category", category.id),

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
    history: history.map(entry => ({
      ...entry,
      player: publicPlayer(entry.player),
      category: entry.category ? publicCategory(entry.category) : null,
    })),
    matches: matches.map(match => ({
      ...match,
      winner: publicPlayer(match.winner),
      loser: publicPlayer(match.loser),
      category: publicCategory(match.category),
    })),

    background: imageURL("setting", "background"),
    logo: imageURL("setting", "logo"),

    pokeCompareHighScores: parsedHighScores,

    pokeCompareArt: imageURL("setting", "pokecompare_art"),

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
