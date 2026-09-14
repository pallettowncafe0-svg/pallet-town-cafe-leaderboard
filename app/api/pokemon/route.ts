import { NextResponse } from "next/server";

export const runtime = "nodejs";

const POKEDEX_URL = "https://play.pokemonshowdown.com/data/pokedex.json";

export async function GET() {
  try {
    const response = await fetch(POKEDEX_URL, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Pokémon API returned ${response.status}`);
    }

    const pokedex = await response.json();
    const pokemon = Object.values(pokedex as Record<string, any>)
      .filter((entry:any) => entry?.name && Number(entry?.num) > 0)
      .map((entry:any) => String(entry.name))
      .filter((name:string, index:number, list:string[]) => list.indexOf(name) === index)
      .sort((a:string, b:string) => a.localeCompare(b));

    return NextResponse.json({ pokemon });
  } catch {
    return NextResponse.json(
      { pokemon: [], error: "Could not load Pokémon data." },
      { status: 502 }
    );
  }
}
