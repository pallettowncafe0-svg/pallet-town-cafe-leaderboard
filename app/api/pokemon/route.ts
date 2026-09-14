import { NextResponse } from "next/server";

export const runtime = "nodejs";

const POKEDEX_URL = "https://play.pokemonshowdown.com/data/pokedex.json";

export async function GET() {
  try {
    const response = await fetch(POKEDEX_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load the Pokémon list.");
    }

    const pokedex = (await response.json()) as Record<
      string,
      { name?: string }
    >;

    const options = Object.entries(pokedex)
      .filter(([, entry]) => Boolean(entry?.name))
      .map(([id, entry]) => ({
        id,
        name: entry.name as string,
      }));

    return NextResponse.json(
      { options },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the Pokémon list.",
      },
      { status: 502 }
    );
  }
}
