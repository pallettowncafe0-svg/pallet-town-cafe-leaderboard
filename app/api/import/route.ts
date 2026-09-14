import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        parsed.S || 0
      );
    }
  }

  if (value) {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function getRowValue(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function getSheet(workbook: XLSX.WorkBook, names: string[]) {
  const wanted = names.map((name) => name.toLowerCase().trim());
  const actual = workbook.SheetNames.find((name) =>
    wanted.includes(name.toLowerCase().trim())
  );
  if (!actual) return [] as Row[];

  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[actual], {
    defval: null,
    raw: true,
  });
}

function pokemonList(row: Row) {
  const list: string[] = [];

  for (let index = 1; index <= 6; index += 1) {
    const value = text(row[`Pokemon ${index}`]);
    if (!value) continue;

    const shiny = text(row[`Shiny ${index}`]).toLowerCase();
    list.push(
      shiny === "yes" || shiny === "true" || shiny === "shiny"
        ? `${value}|shiny`
        : value
    );
  }

  if (list.length) return list;

  const legacy = text(row["Pokemon Set"]);
  return legacy
    ? legacy
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new Error("Choose an .xlsx backup file first.");
    }

    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
      cellDates: true,
    });

    const lifetimeRows = getSheet(workbook, ["Lifetime Leaderboard"]);
    const pointRows = getSheet(workbook, ["Point History"]);
    const categoryRows = getSheet(workbook, ["Category Leaderboards"]);
    const matchRows = getSheet(workbook, ["Match History"]);
    const pokemonRows = getSheet(workbook, ["Pokemon Records"]);

    if (!lifetimeRows.length && !pointRows.length && !categoryRows.length && !matchRows.length && !pokemonRows.length) {
      throw new Error(
        `No supported backup sheets were found. Found: ${workbook.SheetNames.join(", ") || "none"}`
      );
    }

    let playersAdded = 0;
    let playersUpdated = 0;
    let categoriesAdded = 0;
    let matchesAdded = 0;
    let matchesUpdated = 0;
    let transactionsAdded = 0;
    let pokemonUpdated = 0;
    let categoryRecordsImported = 0;
    let skippedMatches = 0;
    const skippedMatchReasons = new Set<string>();

    // IMPORT IS A FULL REPLACEMENT.
    // Keep site settings such as the logo/background, but replace all leaderboard data.
    await db.pointTransaction.deleteMany({});
    await db.match.deleteMany({});
    await db.categoryRecord.deleteMany({});
    await db.category.deleteMany({});
    await db.player.deleteMany({});

    const players = await db.player.findMany();
    const playerById = new Map(players.map((player) => [player.id, player]));
    const playerByIgn = new Map<string, (typeof players)[number]>();
    const playerByName = new Map<string, (typeof players)[number]>();

    for (const player of players) {
      playerByName.set(player.name.toLowerCase(), player);
      if (player.ign) playerByIgn.set(player.ign.toLowerCase(), player);
    }

    const cachePlayer = (player: (typeof players)[number]) => {
      playerById.set(player.id, player);
      playerByName.set(player.name.toLowerCase(), player);
      if (player.ign) playerByIgn.set(player.ign.toLowerCase(), player);
    };

    const findPlayer = (value: string, ign = "") => {
      if (ign) {
        const byIgn = playerByIgn.get(ign.toLowerCase());
        if (byIgn) return byIgn;
      }

      if (!value) return undefined;
      return (
        playerById.get(value) ||
        playerByIgn.get(value.toLowerCase()) ||
        playerByName.get(value.toLowerCase())
      );
    };

    const getOrCreatePlayer = async (nameValue: string, ignValue = "") => {
      const name = nameValue || ignValue;
      const ign = ignValue || null;
      if (!name) return undefined;

      const existing = findPlayer(name, ignValue);
      if (existing) return existing;

      const created = await db.player.create({
        data: {
          name,
          ign,
          points: 0,
          active: true,
        },
      });

      cachePlayer(created);
      playersAdded += 1;
      return created;
    };

    // First pass: make sure every player referenced by any sheet exists.
    for (const row of lifetimeRows) {
      const name = getRowValue(row, ["Full Name", "Name", "Player"]);
      const ign = getRowValue(row, ["IGN", "In-Game Name"]);
      await getOrCreatePlayer(name, ign);
    }

    for (const row of matchRows) {
      const winnerName = getRowValue(row, ["Winner", "Winner Name"]);
      const loserName = getRowValue(row, ["Loser", "Loser Name"]);
      const winnerIgn = getRowValue(row, ["Winner IGN"]);
      const loserIgn = getRowValue(row, ["Loser IGN"]);
      await getOrCreatePlayer(winnerName, winnerIgn);
      await getOrCreatePlayer(loserName, loserIgn);
    }

    for (const row of pointRows) {
      const name = getRowValue(row, ["Player", "Full Name", "Name"]);
      const ign = getRowValue(row, ["IGN"]);
      await getOrCreatePlayer(name, ign);
    }

    for (const row of pokemonRows) {
      const name = getRowValue(row, ["Player", "Full Name", "Name"]);
      const ign = getRowValue(row, ["IGN"]);
      await getOrCreatePlayer(name, ign);
    }

    // Lifetime leaderboard is the authoritative player snapshot from the backup.
    for (const row of lifetimeRows) {
      const name = getRowValue(row, ["Full Name", "Name", "Player"]);
      const ign = getRowValue(row, ["IGN", "In-Game Name"]);
      const player = findPlayer(name, ign);
      if (!player) continue;

      const updated = await db.player.update({
        where: { id: player.id },
        data: {
          name: name || player.name,
          ign: ign || null,
          points: Math.trunc(number(row["Lifetime Points"])),
          bestPerformance: getRowValue(row, ["Best Performance"]) || null,
          active: true,
        },
      });

      cachePlayer(updated);
      playersUpdated += 1;
    }

    const categories = await db.category.findMany();
    const categoryByName = new Map(
      categories.map((category) => [category.name.toLowerCase(), category])
    );

    const ensureCategory = async (nameValue: string) => {
      const name = nameValue.trim();
      if (!name) return undefined;

      const existing = categoryByName.get(name.toLowerCase());
      if (existing) return existing;

      const category = await db.category.create({ data: { name } });
      categoryByName.set(name.toLowerCase(), category);
      categoriesAdded += 1;
      return category;
    };

    for (const row of categoryRows) {
      await ensureCategory(getRowValue(row, ["Category", "Board"]));
    }

    // Import category W/L snapshots too. This means a backup still restores
    // standings even when it was made before Match History existed.
    for (const row of categoryRows) {
      const category = await ensureCategory(getRowValue(row, ["Category", "Board"]));
      const playerRef = getRowValue(row, ["Player", "Full Name", "Name"]);
      const player = findPlayer(playerRef, getRowValue(row, ["IGN"]));
      if (!category || !player) continue;

      await db.categoryRecord.upsert({
        where: {
          categoryId_playerId: {
            categoryId: category.id,
            playerId: player.id,
          },
        },
        create: {
          categoryId: category.id,
          playerId: player.id,
          wins: Math.trunc(number(row["Wins"])),
          losses: Math.trunc(number(row["Losses"])),
        },
        update: {
          wins: Math.trunc(number(row["Wins"])),
          losses: Math.trunc(number(row["Losses"])),
        },
      });
      categoryRecordsImported += 1;
    }

    const categoriesWithImportedMatches = new Set<string>();

    for (const row of matchRows) {
      const categoryName = getRowValue(row, ["Category", "Board", "Battle Board"]);
      const winnerRef = getRowValue(row, ["Winner", "Winner Name", "Winner Player"]);
      const loserRef = getRowValue(row, ["Loser", "Loser Name", "Loser Player"]);
      const winnerIgn = getRowValue(row, ["Winner IGN"]);
      const loserIgn = getRowValue(row, ["Loser IGN"]);

      if (!categoryName || !winnerRef || !loserRef) {
        skippedMatches += 1;
        skippedMatchReasons.add("missing category, winner, or loser");
        continue;
      }

      if (winnerRef.toLowerCase() === loserRef.toLowerCase()) {
        skippedMatches += 1;
        skippedMatchReasons.add("winner and loser are the same player");
        continue;
      }

      const category = await ensureCategory(categoryName);
      const winner = findPlayer(winnerRef, winnerIgn) || (await getOrCreatePlayer(winnerRef, winnerIgn));
      const loser = findPlayer(loserRef, loserIgn) || (await getOrCreatePlayer(loserRef, loserIgn));

      if (!category || !winner || !loser) {
        skippedMatches += 1;
        skippedMatchReasons.add("winner or loser could not be resolved");
        continue;
      }

      const playedAt = dateValue(
        row["Date"] ?? row["Played At"] ?? row["Match Date"] ?? row["Timestamp"]
      );
      const notes = getRowValue(row, ["Notes", "Note"]) || null;
      const backupId = getRowValue(row, ["Match ID", "ID"]);

      if (backupId) {
        const existingById = await db.match.findUnique({ where: { id: backupId } });
        if (existingById) {
          await db.match.update({
            where: { id: backupId },
            data: {
              categoryId: category.id,
              winnerId: winner.id,
              loserId: loser.id,
              notes,
              playedAt,
            },
          });
          matchesUpdated += 1;
          categoriesWithImportedMatches.add(category.id);
          continue;
        }
      }

      const start = new Date(playedAt.getTime() - 1000);
      const end = new Date(playedAt.getTime() + 1000);
      const duplicate = await db.match.findFirst({
        where: {
          categoryId: category.id,
          winnerId: winner.id,
          loserId: loser.id,
          playedAt: { gte: start, lte: end },
          notes,
        },
      });

      if (duplicate) {
        categoriesWithImportedMatches.add(category.id);
        continue;
      }

      await db.match.create({
        data: {
          categoryId: category.id,
          winnerId: winner.id,
          loserId: loser.id,
          notes,
          playedAt,
        },
      });
      matchesAdded += 1;
      categoriesWithImportedMatches.add(category.id);
    }

    for (const row of pointRows) {
      const playerRef = getRowValue(row, ["Player", "Full Name", "Name"]);
      const player = findPlayer(playerRef, getRowValue(row, ["IGN"]));
      if (!player) continue;

      const amount = Math.trunc(number(row["Points Change"]));
      if (!amount) continue;

      const createdAt = dateValue(row["Date"]);
      const reason = getRowValue(row, ["Reason"]) || null;
      const action = getRowValue(row, ["Action"]) || "Imported transaction";
      const actor = getRowValue(row, ["Admin", "Actor"]) || "Import";
      const transactionId = getRowValue(row, ["Transaction ID"]);

      if (transactionId) {
        const existingById = await db.pointTransaction.findUnique({
          where: { id: transactionId },
        });
        if (existingById) continue;
      }

      const categoryName = getRowValue(row, ["Category"]);
      const category = categoryName
        ? await ensureCategory(categoryName)
        : undefined;

      const duplicate = await db.pointTransaction.findFirst({
        where: {
          playerId: player.id,
          amount,
          reason,
          action,
          createdAt: {
            gte: new Date(createdAt.getTime() - 1000),
            lte: new Date(createdAt.getTime() + 1000),
          },
        },
      });

      if (duplicate) continue;

      await db.pointTransaction.create({
        data: {
          playerId: player.id,
          categoryId: category?.id || null,
          amount,
          newTotal: Math.trunc(number(row["New Total"])),
          reason,
          action,
          actor,
          createdAt,
        },
      });
      transactionsAdded += 1;
    }

    for (const row of pokemonRows) {
      const board = getRowValue(row, ["Board", "Category"]);
      const playerRef = getRowValue(row, ["Player", "Full Name", "Name"]);
      const player = findPlayer(playerRef, getRowValue(row, ["IGN"]));
      if (!board || !player) continue;

      const pokemon = pokemonList(row).slice(0, 6);

      if (board.toLowerCase() === "hall of fame" || board.toLowerCase() === "hall") {
        await db.player.update({
          where: { id: player.id },
          data: { hallPokemon: JSON.stringify(pokemon) },
        });
      } else {
        const category = await ensureCategory(board);
        if (!category) continue;

        const existing = await db.categoryRecord.findUnique({
          where: {
            categoryId_playerId: {
              categoryId: category.id,
              playerId: player.id,
            },
          },
        });

        if (existing) {
          await db.categoryRecord.update({
            where: { id: existing.id },
            data: { pokemon: JSON.stringify(pokemon) },
          });
        } else {
          await db.categoryRecord.create({
            data: {
              categoryId: category.id,
              playerId: player.id,
              pokemon: JSON.stringify(pokemon),
            },
          });
        }
      }

      pokemonUpdated += 1;
    }

    // Match History is authoritative for categories that actually had matches
    // in the imported backup. Other category leaderboard snapshots remain as imported.
    for (const categoryId of categoriesWithImportedMatches) {
      const matches = await db.match.findMany({ where: { categoryId } });
      const records = await db.categoryRecord.findMany({
        where: { categoryId },
        select: { playerId: true, pokemon: true },
      });

      const pokemonByPlayer = new Map(
        records.map((record) => [record.playerId, record.pokemon])
      );
      const totals = new Map<string, { wins: number; losses: number }>();

      for (const match of matches) {
        const winner = totals.get(match.winnerId) || { wins: 0, losses: 0 };
        winner.wins += 1;
        totals.set(match.winnerId, winner);

        const loser = totals.get(match.loserId) || { wins: 0, losses: 0 };
        loser.losses += 1;
        totals.set(match.loserId, loser);
      }

      const playerIds = new Set([...totals.keys(), ...pokemonByPlayer.keys()]);

      for (const playerId of playerIds) {
        const record = totals.get(playerId) || { wins: 0, losses: 0 };
        await db.categoryRecord.upsert({
          where: {
            categoryId_playerId: {
              categoryId,
              playerId,
            },
          },
          create: {
            categoryId,
            playerId,
            wins: record.wins,
            losses: record.losses,
            pokemon: pokemonByPlayer.get(playerId) || null,
          },
          update: {
            wins: record.wins,
            losses: record.losses,
            pokemon: pokemonByPlayer.get(playerId) || null,
          },
        });
      }
    }

    const skippedMessage = skippedMatches
      ? ` Skipped ${skippedMatches} match rows (${Array.from(skippedMatchReasons).join("; ")}).`
      : "";

    return NextResponse.json({
      ok: true,
      message:
        `Import replaced the current data: ${matchesAdded} matches imported, ` +
        `${playersAdded} players added, ${playersUpdated} players updated, ` +
        `${transactionsAdded} point transactions added, ${categoryRecordsImported} category records imported, ` +
        `${pokemonUpdated} Pokémon board sets updated.${skippedMessage}`,
      counts: {
        playersAdded,
        playersUpdated,
        categoriesAdded,
        matchesAdded,
        matchesUpdated,
        transactionsAdded,
        categoryRecordsImported,
        pokemonUpdated,
        skippedMatches,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 400 }
    );
  }
}
