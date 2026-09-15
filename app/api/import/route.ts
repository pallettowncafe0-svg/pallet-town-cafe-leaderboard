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
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = text(value).replace(/,/g, "").replace(/%/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const result = new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        parsed.S || 0
      );
      if (!Number.isNaN(result.getTime())) return result;
    }
  }

  const raw = text(value);
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function key(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizedRow(row: Row) {
  const result: Row = {};
  for (const [name, value] of Object.entries(row)) result[key(name)] = value;
  return result;
}

function getRowValue(row: Row, keys: string[]) {
  for (const candidate of keys) {
    const value = text(row[key(candidate)]);
    if (value) return value;
  }
  return "";
}

function getChunkedValue(row: Row, prefix: string) {
  const normalizedPrefix = key(prefix);
  const direct = text(row[normalizedPrefix]);
  if (direct) return direct;

  const parts: string[] = [];
  for (let index = 1; index <= 200; index += 1) {
    const value = text(row[key(`${prefix} ${index}`)]);
    if (!value) break;
    parts.push(value);
  }
  return parts.join("");
}

function getSheet(workbook: XLSX.WorkBook, names: string[]) {
  const wanted = new Set(names.map(key));
  const actual = workbook.SheetNames.find((name) => wanted.has(key(name)));
  if (!actual) return [] as Row[];

  return XLSX.utils
    .sheet_to_json<Row>(workbook.Sheets[actual], {
      defval: null,
      raw: true,
    })
    .map(normalizedRow);
}

function pokemonList(row: Row) {
  const list: string[] = [];

  for (let index = 1; index <= 6; index += 1) {
    const value = getRowValue(row, [`Pokemon ${index}`]);
    if (!value) continue;

    const shiny = getRowValue(row, [`Shiny ${index}`]).toLowerCase();
    list.push(
      shiny === "yes" || shiny === "true" || shiny === "shiny" || shiny === "1"
        ? `${value}|shiny`
        : value
    );
  }

  if (list.length) return list;

  const legacy = getRowValue(row, ["Pokemon Set"]);
  return legacy
    ? legacy
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function boolValue(value: unknown) {
  const normalized = text(value).toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1";
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose an .xlsx backup file first.");

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) throw new Error("The selected Excel file is empty.");

    const workbook = XLSX.read(bytes, {
      type: "buffer",
      cellDates: true,
      cellNF: false,
      cellText: true,
    });

    const lifetimeRows = getSheet(workbook, ["Lifetime Leaderboard"]);
    const pointRows = getSheet(workbook, ["Point History"]);
    const categoryRows = getSheet(workbook, ["Category Leaderboards"]);
    const matchRows = getSheet(workbook, ["Match History"]);
    const pokemonRows = getSheet(workbook, ["Pokemon Records"]);
    const highScoreRows = getSheet(workbook, ["PokéCompare High Scores", "PokeCompare High Scores"]);
    const settingsRows = getSheet(workbook, ["PokéCompare Settings", "PokeCompare Settings"]);
    const categorySettingsRows = getSheet(workbook, ["Category Settings", "Battle Board Settings"]);

    const supportedCount = [
      lifetimeRows,
      pointRows,
      categoryRows,
      matchRows,
      pokemonRows,
      highScoreRows,
      settingsRows,
      categorySettingsRows,
    ].filter((rows) => rows.length > 0).length;

    if (!supportedCount) {
      throw new Error(
        `No supported backup sheets were found. Found: ${workbook.SheetNames.join(", ") || "none"}.`
      );
    }

    // Preflight the important rows BEFORE deleting anything from the database.
    // This prevents a malformed workbook from wiping the live leaderboard.
    const matchProblems: string[] = [];
    for (let index = 0; index < matchRows.length; index += 1) {
      const row = matchRows[index];
      const category = getRowValue(row, ["Category", "Board", "Battle Board"]);
      const winner = getRowValue(row, ["Winner", "Winner Name", "Winner Player", "Winner IGN"]);
      const loser = getRowValue(row, ["Loser", "Loser Name", "Loser Player", "Loser IGN"]);
      if (!category || !winner || !loser) {
        matchProblems.push(`row ${index + 2}: missing category, winner, or loser`);
      }
    }

    if (matchProblems.length === matchRows.length && matchRows.length > 0) {
      throw new Error(
        `The Match History sheet was found, but none of its rows contain the required Category, Winner, and Loser fields. First problem: ${matchProblems[0]}`
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

    await db.$transaction(
      async (tx) => {
        // FULL REPLACEMENT: leaderboard data is rebuilt from the workbook.
        await tx.pointTransaction.deleteMany({});
        await tx.match.deleteMany({});
        await tx.categoryRecord.deleteMany({});
        await tx.category.deleteMany({});
        await tx.player.deleteMany({});

        await tx.setting.upsert({
          where: { key: "pokecompare_highscores" },
          create: { key: "pokecompare_highscores", value: "[]" },
          update: { value: "[]" },
        });
        await tx.setting.deleteMany({ where: { key: "pokecompare_art" } });
        await tx.setting.upsert({
          where: { key: "pokecompare_hide_details" },
          create: { key: "pokecompare_hide_details", value: "false" },
          update: { value: "false" },
        });

        const players = await tx.player.findMany();
        const playerById = new Map(players.map((player) => [player.id, player]));
        const playerByIgn = new Map<string, (typeof players)[number]>();
        const playerByName = new Map<string, (typeof players)[number]>();

        const cachePlayer = (player: (typeof players)[number]) => {
          playerById.set(player.id, player);
          playerByName.set(player.name.toLowerCase(), player);
          if (player.ign) playerByIgn.set(player.ign.toLowerCase(), player);
        };

        for (const player of players) cachePlayer(player);

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

          const created = await tx.player.create({
            data: { name, ign, points: 0, active: true },
          });
          cachePlayer(created);
          playersAdded += 1;
          return created;
        };

        // Create every referenced player first.
        const playerSheets = [lifetimeRows, matchRows, pointRows, pokemonRows];
        for (const rows of playerSheets) {
          for (const row of rows) {
            let name = "";
            let ign = "";
            if (rows === matchRows) {
              name = getRowValue(row, ["Winner", "Winner Name", "Winner Player"]);
              ign = getRowValue(row, ["Winner IGN"]);
              await getOrCreatePlayer(name, ign);
              name = getRowValue(row, ["Loser", "Loser Name", "Loser Player"]);
              ign = getRowValue(row, ["Loser IGN"]);
            } else {
              name = getRowValue(row, ["Full Name", "Player", "Name"]);
              ign = getRowValue(row, ["IGN", "In-Game Name"]);
            }
            await getOrCreatePlayer(name, ign);
          }
        }

        for (const row of lifetimeRows) {
          const name = getRowValue(row, ["Full Name", "Name", "Player"]);
          const ign = getRowValue(row, ["IGN", "In-Game Name"]);
          const player = findPlayer(name, ign);
          if (!player) continue;

          const updated = await tx.player.update({
            where: { id: player.id },
            data: {
              name: name || player.name,
              ign: ign || null,
              points: Math.trunc(number(getRowValue(row, ["Lifetime Points", "Points"]))),
              bestPerformance: getRowValue(row, ["Best Performance"]) || null,
              image: getChunkedValue(row, "Profile Picture") || null,
              active: true,
            },
          });
          cachePlayer(updated);
          playersUpdated += 1;
        }

        const categories = await tx.category.findMany();
        const categoryByName = new Map(
          categories.map((category) => [category.name.toLowerCase(), category])
        );

        const ensureCategory = async (nameValue: string) => {
          const name = nameValue.trim();
          if (!name) return undefined;
          const existing = categoryByName.get(name.toLowerCase());
          if (existing) return existing;

          const category = await tx.category.create({ data: { name } });
          categoryByName.set(name.toLowerCase(), category);
          categoriesAdded += 1;
          return category;
        };

        for (const row of categorySettingsRows) {
          await ensureCategory(getRowValue(row, ["Category", "Board", "Name"]));
        }
        for (const row of categoryRows) {
          await ensureCategory(getRowValue(row, ["Category", "Board"]));
        }

        for (const row of categorySettingsRows) {
          const name = getRowValue(row, ["Category", "Board", "Name"]);
          const category = await ensureCategory(name);
          if (!category) continue;
          await tx.category.update({where:{id:category.id},data:{description:getRowValue(row,["Description"])||null,image:getChunkedValue(row,"Image")||null}});
        }

        for (const row of categoryRows) {
          const category = await ensureCategory(getRowValue(row, ["Category", "Board"]));
          const player = findPlayer(
            getRowValue(row, ["Player", "Full Name", "Name"]),
            getRowValue(row, ["IGN"])
          );
          if (!category || !player) continue;

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
              wins: Math.trunc(number(row[key("Wins")])),
              losses: Math.trunc(number(row[key("Losses")])),
            },
            update: {
              wins: Math.trunc(number(row[key("Wins")])),
              losses: Math.trunc(number(row[key("Losses")])),
            },
          });
          categoryRecordsImported += 1;
        }

        const categoriesWithImportedMatches = new Set<string>();

        for (let index = 0; index < matchRows.length; index += 1) {
          const row = matchRows[index];
          const categoryName = getRowValue(row, ["Category", "Board", "Battle Board"]);
          const winnerRef = getRowValue(row, ["Winner", "Winner Name", "Winner Player", "Winner IGN"]);
          const loserRef = getRowValue(row, ["Loser", "Loser Name", "Loser Player", "Loser IGN"]);
          const winnerIgn = getRowValue(row, ["Winner IGN"]);
          const loserIgn = getRowValue(row, ["Loser IGN"]);

          if (!categoryName || !winnerRef || !loserRef) {
            skippedMatches += 1;
            skippedMatchReasons.add(`row ${index + 2}: missing category, winner, or loser`);
            continue;
          }

          if (winnerRef.toLowerCase() === loserRef.toLowerCase() && !winnerIgn && !loserIgn) {
            skippedMatches += 1;
            skippedMatchReasons.add(`row ${index + 2}: winner and loser are the same player`);
            continue;
          }

          const category = await ensureCategory(categoryName);
          const winner = findPlayer(winnerRef, winnerIgn) || (await getOrCreatePlayer(winnerRef, winnerIgn));
          const loser = findPlayer(loserRef, loserIgn) || (await getOrCreatePlayer(loserRef, loserIgn));
          if (!category || !winner || !loser || winner.id === loser.id) {
            skippedMatches += 1;
            skippedMatchReasons.add(`row ${index + 2}: winner or loser could not be resolved`);
            continue;
          }

          const playedAt = dateValue(
            row[key("Date")] ?? row[key("Played At")] ?? row[key("Match Date")] ?? row[key("Timestamp")]
          );
          const notes = getRowValue(row, ["Notes", "Note"]) || null;
          const backupId = getRowValue(row, ["Match ID", "ID"]);

          if (backupId) {
            // The database was cleared, so an imported ID cannot collide. Keep it
            // only when it is a valid non-empty string; Prisma will generate IDs otherwise.
            try {
              await tx.match.create({
                data: {
                  id: backupId,
                  categoryId: category.id,
                  winnerId: winner.id,
                  loserId: loser.id,
                  notes,
                  playedAt,
                },
              });
            } catch {
              await tx.match.create({
                data: {
                  categoryId: category.id,
                  winnerId: winner.id,
                  loserId: loser.id,
                  notes,
                  playedAt,
                },
              });
            }
          } else {
            await tx.match.create({
              data: {
                categoryId: category.id,
                winnerId: winner.id,
                loserId: loser.id,
                notes,
                playedAt,
              },
            });
          }

          matchesAdded += 1;
          categoriesWithImportedMatches.add(category.id);
        }

        for (const row of pointRows) {
          const player = findPlayer(
            getRowValue(row, ["Player", "Full Name", "Name"]),
            getRowValue(row, ["IGN"])
          );
          if (!player) continue;

          const amount = Math.trunc(number(getRowValue(row, ["Points Change", "Amount"])));
          if (!amount) continue;

          const createdAt = dateValue(getRowValue(row, ["Date", "Created At", "Timestamp"]));
          const reason = getRowValue(row, ["Reason"]) || null;
          const action = getRowValue(row, ["Action"]) || "Imported transaction";
          const actor = getRowValue(row, ["Admin", "Actor"]) || "Import";
          const transactionId = getRowValue(row, ["Transaction ID"]);
          const categoryName = getRowValue(row, ["Category"]);
          const category = categoryName ? await ensureCategory(categoryName) : undefined;

          await tx.pointTransaction.create({
            data: {
              ...(transactionId ? { id: transactionId } : {}),
              playerId: player.id,
              categoryId: category?.id || null,
              amount,
              newTotal: Math.trunc(number(getRowValue(row, ["New Total"]))),
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
          const player = findPlayer(
            getRowValue(row, ["Player", "Full Name", "Name"]),
            getRowValue(row, ["IGN"])
          );
          if (!board || !player) continue;

          const pokemon = pokemonList(row).slice(0, 6);
          if (key(board) === "halloffame" || key(board) === "hall") {
            await tx.player.update({
              where: { id: player.id },
              data: { hallPokemon: JSON.stringify(pokemon) },
            });
          } else {
            const category = await ensureCategory(board);
            if (!category) continue;
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

        // Match History is authoritative for W/L when matches exist.
        for (const categoryId of categoriesWithImportedMatches) {
          const matches = await tx.match.findMany({ where: { categoryId } });
          const existingRecords = await tx.categoryRecord.findMany({
            where: { categoryId },
            select: { playerId: true, pokemon: true },
          });
          const pokemonByPlayer = new Map(existingRecords.map((r) => [r.playerId, r.pokemon]));
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
            await tx.categoryRecord.upsert({
              where: {
                categoryId_playerId: { categoryId, playerId },
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

        const importedHighScores = highScoreRows
          .map((row) => ({
            score: Math.max(0, Math.trunc(number(getRowValue(row, ["Score"])))),
            name: getRowValue(row, ["Name", "Player", "Initials"]).slice(0, 16),
            note: getRowValue(row, ["Message", "Note"]).slice(0, 24),
            createdAt: dateValue(getRowValue(row, ["Date", "Created At"])).toISOString(),
          }))
          .filter((entry) => entry.score > 0 && entry.name)
          .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
          .slice(0, 10);

        await tx.setting.upsert({
          where: { key: "pokecompare_highscores" },
          create: { key: "pokecompare_highscores", value: JSON.stringify(importedHighScores) },
          update: { value: JSON.stringify(importedHighScores) },
        });

        const settingsRow = settingsRows[0];
        const importedArt = settingsRow
          ? getChunkedValue(settingsRow, "Artwork") || getRowValue(settingsRow, ["Art", "Image"])
          : "";
        const importedHideDetails = settingsRow
          ? getRowValue(settingsRow, ["Hide High Score Details", "Hide Names and Messages", "Hide High Scores"])
          : "";
        const hideHighScoreDetails = boolValue(importedHideDetails);

        await tx.setting.upsert({
          where: { key: "pokecompare_hide_details" },
          create: { key: "pokecompare_hide_details", value: JSON.stringify(hideHighScoreDetails) },
          update: { value: JSON.stringify(hideHighScoreDetails) },
        });

        if (importedArt && importedArt.startsWith("data:image/")) {
          await tx.setting.upsert({
            where: { key: "pokecompare_art" },
            create: { key: "pokecompare_art", value: importedArt },
            update: { value: importedArt },
          });
        }
      },
      { maxWait: 10000, timeout: 120000 },
    );

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
        highScoresImported: highScoreRows.length,
      },
    });
  } catch (error) {
    console.error("[PTC IMPORT]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Import failed: ${error.message}`
            : "Import failed.",
      },
      { status: 400 }
    );
  }
}
