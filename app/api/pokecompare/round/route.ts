import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const POKEAPI_BASE = "https://pokeapi.co/api/v2/pokemon";
const TOTAL_POKEMON = 1025;

const METRICS = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "Attack" },
  { key: "defense", label: "Defense" },
  { key: "special-attack", label: "Sp. Attack" },
  { key: "special-defense", label: "Sp. Defense" },
  { key: "speed", label: "Speed" },
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "bst", label: "Base Stat Total" },
] as const;

type GamePokemon = {
  id: number;
  name: string;
  height: number;
  weight: number;
  stats: Record<string, number>;
  sprite: string;
  types: string[];
};

async function getPokemon(id: number): Promise<GamePokemon> {
  const response = await fetch(`${POKEAPI_BASE}/${id}`, {
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(`PokéAPI returned ${response.status}.`);
  }

  const item = await response.json();
  const stats: Record<string, number> = {};

  for (const entry of item.stats || []) {
    stats[entry.stat.name] = Number(entry.base_stat) || 0;
  }

  stats.bst = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].reduce((total, key) => total + (stats[key] || 0), 0);

  return {
    id: Number(item.id),
    name: String(item.name),
    height: Number(item.height) || 0,
    weight: Number(item.weight) || 0,
    stats,
    sprite:
      item.sprites?.other?.["official-artwork"]?.front_default ||
      item.sprites?.front_default ||
      "",
    types: Array.isArray(item.types)
      ? item.types.map((entry: any) => String(entry.type.name))
      : [],
  };
}

function randomId(exclude?: number) {
  let id = Math.floor(Math.random() * TOTAL_POKEMON) + 1;
  while (id === exclude) {
    id = Math.floor(Math.random() * TOTAL_POKEMON) + 1;
  }
  return id;
}

function valueFor(pokemon: GamePokemon, key: string) {
  if (key === "height") return pokemon.height;
  if (key === "weight") return pokemon.weight;
  return pokemon.stats[key] || 0;
}

export async function GET(request: NextRequest) {
  try {
    const currentId = Number(request.nextUrl.searchParams.get("currentId")) || 0;
    const current = currentId >= 1 && currentId <= TOTAL_POKEMON
      ? await getPokemon(currentId)
      : await getPokemon(randomId());

    let metric = METRICS[Math.floor(Math.random() * METRICS.length)];
    let next = await getPokemon(randomId(current.id));

    for (let tries = 0; tries < 8; tries += 1) {
      if (valueFor(current, metric.key) !== valueFor(next, metric.key)) break;
      next = await getPokemon(randomId(current.id));
      metric = METRICS[Math.floor(Math.random() * METRICS.length)];
    }

    if (valueFor(current, metric.key) === valueFor(next, metric.key)) {
      const nonTie = METRICS.find(
        (candidate) => valueFor(current, candidate.key) !== valueFor(next, candidate.key)
      );
      if (nonTie) metric = nonTie;
    }

    return NextResponse.json({ current, next, metric });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load Pokémon from PokéAPI.",
      },
      { status: 502 }
    );
  }
}
