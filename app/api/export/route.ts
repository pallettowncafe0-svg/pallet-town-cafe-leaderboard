import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

function parsePokemon(value: string | null) {
  if (!value) return { name: "", shiny: "No" };
  const shiny = value.endsWith("|shiny");
  return {
    name: shiny ? value.slice(0, -6) : value,
    shiny: shiny ? "Yes" : "No",
  };
}

function pokemonColumns(value: string | null) {
  const list = value ? JSON.parse(value) : [];
  const result: Record<string, string> = {};
  for (let index = 1; index <= 6; index += 1) {
    const parsed = parsePokemon(list[index - 1] || "");
    result[`Pokemon ${index}`] = parsed.name;
    result[`Shiny ${index}`] = parsed.shiny;
  }
  return result;
}

export async function GET() {
  try {
    await requireAdmin();

    const [players, categories, transactions, matches, records, highScoreSetting, pokeCompareArtSetting, pokeComparePrivacySetting] = await Promise.all([
      db.player.findMany({ where: { active: true }, orderBy: [{ points: "desc" }, { name: "asc" }] }),
      db.category.findMany({ include: { records: { where: { player: { active: true } }, include: { player: true } } }, orderBy: { name: "asc" } }),
      db.pointTransaction.findMany({ include: { player: true, category: true }, orderBy: { createdAt: "desc" } }),
      db.match.findMany({ include: { category: true, winner: true, loser: true }, orderBy: { playedAt: "desc" } }),
      db.categoryRecord.findMany({ where: { player: { active: true } }, include: { category: true, player: true }, orderBy: { category: { name: "asc" } } }),
      db.setting.findUnique({ where: { key: "pokecompare_highscores" } }),
      db.setting.findUnique({ where: { key: "pokecompare_art" } }),
      db.setting.findUnique({ where: { key: "pokecompare_hide_details" } }),
    ]);

    const lifetime = players.map((player, index) => ({
      "Rank": index + 1,
      "Full Name": player.name,
      "IGN": player.ign || "",
      "Lifetime Points": player.points,
      "Best Performance": player.bestPerformance || "",
      "Date Added": player.createdAt,
      "Last Updated": player.updatedAt,
    }));

    const pointHistory = transactions.map((transaction) => ({
      "Transaction ID": transaction.id,
      "Date": transaction.createdAt,
      "Player": transaction.player.name,
      "Points Change": transaction.amount,
      "New Total": transaction.newTotal,
      "Reason": transaction.reason || "",
      "Action": transaction.action,
      "Admin": transaction.actor,
      "Category": transaction.category?.name || "",
    }));

    const categoryLeaderboard: Record<string, unknown>[] = [];
    for (const category of categories) {
      const sorted = [...category.records].sort((a, b) => {
        const aGames = a.wins + a.losses;
        const bGames = b.wins + b.losses;
        const aRate = aGames ? a.wins / aGames : 0;
        const bRate = bGames ? b.wins / bGames : 0;
        return bRate - aRate || b.wins - a.wins || a.player.name.localeCompare(b.player.name);
      });

      sorted.forEach((record, index) => {
        const games = record.wins + record.losses;
        categoryLeaderboard.push({
          "Category": category.name,
          "Rank": index + 1,
          "Player": record.player.name,
          "Wins": record.wins,
          "Losses": record.losses,
          "Win Rate": games ? `${Math.round((record.wins / games) * 100)}%` : "0%",
        });
      });
    }

    const matchHistory = matches.map((match) => ({
      "Match ID": match.id,
      "Category": match.category.name,
      "Winner": match.winner.name,
      "Loser": match.loser.name,
      "Date": match.playedAt,
      "Notes": match.notes || "",
    }));

    const pokemonRecords: Record<string, unknown>[] = [];

    for (const player of players) {
      const set = pokemonColumns(player.hallPokemon);
      pokemonRecords.push({
        Board: "Hall of Fame",
        Player: player.name,
        IGN: player.ign || "",
        ...set,
      });
    }

    for (const record of records) {
      const set = pokemonColumns(record.pokemon);
      pokemonRecords.push({
        Board: record.category.name,
        Player: record.player.name,
        IGN: record.player.ign || "",
        ...set,
      });
    }

    let highScores: any[] = [];
    if (highScoreSetting?.value) {
      try {
        const parsed = JSON.parse(highScoreSetting.value);
        highScores = Array.isArray(parsed) ? parsed.slice(0, 10) : [];
      } catch {
        highScores = [];
      }
    }

    const highScoreRows = highScores.map((entry, index) => ({
      "Rank": index + 1,
      "Score": Number(entry.score) || 0,
      "Name": String(entry.name || ""),
      "Message": String(entry.note || ""),
      "Date": entry.createdAt ? new Date(entry.createdAt) : new Date(),
    }));

    const workbook = XLSX.utils.book_new();
    const addSheet = (name: string, data: Record<string, unknown>[]) => {
      const sheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };

    addSheet("Lifetime Leaderboard", lifetime);
    addSheet("Point History", pointHistory);
    addSheet("Category Leaderboards", categoryLeaderboard);
    addSheet("Match History", matchHistory);
    addSheet("Pokemon Records", pokemonRecords);
    addSheet("PokéCompare High Scores", highScoreRows);
    let hideHighScoreDetails = false;
    if (pokeComparePrivacySetting?.value) {
      try { hideHighScoreDetails = JSON.parse(pokeComparePrivacySetting.value) === true; } catch { hideHighScoreDetails = pokeComparePrivacySetting.value === "true"; }
    }

    addSheet("PokéCompare Settings", [{
      "Artwork": pokeCompareArtSetting?.value || "",
      "Hide High Score Details": hideHighScoreDetails ? "Yes" : "No",
    }]);

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const filename = `ptc-leaderboard-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 400 }
    );
  }
}
