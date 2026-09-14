import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

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
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function rows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [] as Record<string, unknown>[];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
}

function pokemonList(row: Record<string, unknown>) {
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

  // Backward compatibility for an export/import that used one Pokemon Set cell.
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

    const lifetimeRows = rows(workbook, "Lifetime Leaderboard");
    const pointRows = rows(workbook, "Point History");
    const categoryRows = rows(workbook, "Category Leaderboards");
    const matchRows = rows(workbook, "Match History");
    const pokemonRows = rows(workbook, "Pokemon Records");

    let playersAdded = 0;
    let playersUpdated = 0;
    let categoriesAdded = 0;
    let matchesAdded = 0;
    let matchesUpdated = 0;
    let transactionsAdded = 0;
    let pokemonUpdated = 0;

    await db.$transaction(async (tx) => {
      const playerCache = await tx.player.findMany();
      const playerById = new Map(playerCache.map((player) => [player.id, player]));
      const playerByIgn = new Map(
        playerCache
          .filter((player) => player.ign)
          .map((player) => [player.ign!.toLowerCase(), player])
      );
      const playerByName = new Map(
        playerCache.map((player) => [player.name.toLowerCase(), player])
      );

      const getOrCreatePlayer = async (name: string, ign: string | null) => {
        const normalizedName = name.toLowerCase();
        const normalizedIgn = ign?.toLowerCase();
        let player =
          (normalizedIgn ? playerByIgn.get(normalizedIgn) : undefined) ||
          playerByName.get(normalizedName);

        if (player) return player;

        player = await tx.player.create({
          data: {
            name,
            ign,
            points: 0,
            active: true,
          },
        });

        playerById.set(player.id, player);
        playerByName.set(normalizedName, player);
        if (normalizedIgn) playerByIgn.set(normalizedIgn, player);
        playersAdded += 1;
        return player;
      };

      for (const row of lifetimeRows) {
        const name = text(row["Full Name"]);
        if (!name) continue;

        const ign = text(row["IGN"]) || null;
        const points = Math.trunc(number(row["Lifetime Points"]));
        const bestPerformance = text(row["Best Performance"]) || null;
        const existing =
          (ign ? playerByIgn.get(ign.toLowerCase()) : undefined) ||
          playerByName.get(name.toLowerCase());

        if (existing) {
          const player = await tx.player.update({
            where: { id: existing.id },
            data: {
              name,
              ign,
              points,
              bestPerformance,
              active: true,
            },
          });

          playerById.set(player.id, player);
          playerByName.set(name.toLowerCase(), player);
          if (ign) playerByIgn.set(ign.toLowerCase(), player);
          playersUpdated += 1;
        } else {
          const player = await getOrCreatePlayer(name, ign);
          const updated = await tx.player.update({
            where: { id: player.id },
            data: { points, bestPerformance, active: true },
          });
          playerById.set(updated.id, updated);
          playersAdded += 0;
        }
      }

      const categoryCache = await tx.category.findMany();
      const categoryByName = new Map(
        categoryCache.map((category) => [category.name.toLowerCase(), category])
      );

      const ensureCategory = async (name: string) => {
        const key = name.toLowerCase();
        const existing = categoryByName.get(key);
        if (existing) return existing;

        const category = await tx.category.create({ data: { name } });
        categoryByName.set(key, category);
        categoriesAdded += 1;
        return category;
      };

      for (const row of categoryRows) {
        const name = text(row["Category"]);
        if (name) await ensureCategory(name);
      }

      for (const row of matchRows) {
        const categoryName = text(row["Category"]);
        const winnerName = text(row["Winner"]);
        const loserName = text(row["Loser"]);
        if (!categoryName || !winnerName || !loserName) continue;
        if (winnerName.toLowerCase() === loserName.toLowerCase()) continue;

        const category = await ensureCategory(categoryName);
        const winner =
          playerByName.get(winnerName.toLowerCase()) ||
          playerByIgn.get(winnerName.toLowerCase());
        const loser =
          playerByName.get(loserName.toLowerCase()) ||
          playerByIgn.get(loserName.toLowerCase());
        if (!winner || !loser) continue;

        const playedAt = dateValue(row["Date"]);
        const notes = text(row["Notes"]) || null;
        const backupId = text(row["Match ID"]);

        if (backupId) {
          const existing = await tx.match.findUnique({ where: { id: backupId } });
          if (existing) {
            await tx.match.update({
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
            continue;
          }
        }

        const duplicate = await tx.match.findFirst({
          where: {
            categoryId: category.id,
            winnerId: winner.id,
            loserId: loser.id,
            playedAt,
            notes,
          },
        });

        if (!duplicate) {
          await tx.match.create({
            data: {
              categoryId: category.id,
              winnerId: winner.id,
              loserId: loser.id,
              notes,
              playedAt,
            },
          });
          matchesAdded += 1;
        }
      }

      for (const row of pointRows) {
        const playerName = text(row["Player"]);
        if (!playerName) continue;
        const player =
          playerByName.get(playerName.toLowerCase()) ||
          playerByIgn.get(playerName.toLowerCase());
        if (!player) continue;

        const amount = Math.trunc(number(row["Points Change"]));
        if (!amount) continue;
        const createdAt = dateValue(row["Date"]);
        const reason = text(row["Reason"]) || null;
        const action = text(row["Action"]) || "Imported transaction";
        const actor = text(row["Admin"]) || "Import";

        const duplicate = await tx.pointTransaction.findFirst({
          where: {
            playerId: player.id,
            amount,
            reason,
            action,
            createdAt,
          },
        });

        if (!duplicate) {
          const categoryName =
            text(row["Category"]) ||
            reason?.split(" - ")[0]?.trim() ||
            action.replace(/ points( edited)?$/i, "").trim();
          const category = categoryByName.get(categoryName.toLowerCase());

          await tx.pointTransaction.create({
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
      }

      for (const row of pokemonRows) {
        const board = text(row["Board"] || row["Category"]);
        const playerName = text(row["Player"]);
        if (!board || !playerName) continue;

        const player =
          playerByName.get(playerName.toLowerCase()) ||
          playerByIgn.get(playerName.toLowerCase());
        if (!player) continue;

        const pokemon = pokemonList(row).slice(0, 6);
        if (board.toLowerCase() === "hall of fame") {
          await tx.player.update({
            where: { id: player.id },
            data: { hallPokemon: JSON.stringify(pokemon) },
          });
        } else {
          const category = await ensureCategory(board);
          await tx.categoryRecord.upsert({
            where: {
              categoryId_playerId: {
                categoryId: category.id,
                playerId: player.id,
              },
            },
            create: {
              categoryId: category.id,
              playerId: player.id,
              pokemon: JSON.stringify(pokemon),
            },
            update: { pokemon: JSON.stringify(pokemon) },
          });
        }
        pokemonUpdated += 1;
      }

      // Match History is the source of truth for W/L records. Rebuild every
      // category after importing matches while preserving each player's saved
      // Pokémon lineup.
      const categories = await tx.category.findMany();
      for (const category of categories) {
        const [matches, existingRecords] = await Promise.all([
          tx.match.findMany({ where: { categoryId: category.id } }),
          tx.categoryRecord.findMany({
            where: { categoryId: category.id },
            select: { playerId: true, pokemon: true },
          }),
        ]);

        const pokemonByPlayer = new Map(
          existingRecords.map((record) => [record.playerId, record.pokemon])
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

        await tx.categoryRecord.deleteMany({ where: { categoryId: category.id } });

        const recordPlayerIds = new Set([
          ...totals.keys(),
          ...pokemonByPlayer.keys(),
        ]);

        if (recordPlayerIds.size) {
          await tx.categoryRecord.createMany({
            data: Array.from(recordPlayerIds).map((playerId) => {
              const record = totals.get(playerId) || { wins: 0, losses: 0 };
              return {
                categoryId: category.id,
                playerId,
                wins: record.wins,
                losses: record.losses,
                pokemon: pokemonByPlayer.get(playerId) || null,
              };
            }),
          });
        }
      }
    });

    return NextResponse.json({
      ok: true,
      message: `Import complete: ${matchesAdded} new matches, ${matchesUpdated} matches updated, ${playersAdded} players added, ${playersUpdated} players updated, ${transactionsAdded} point transactions added, and ${pokemonUpdated} Pokémon board sets updated.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 400 }
    );
  }
}
