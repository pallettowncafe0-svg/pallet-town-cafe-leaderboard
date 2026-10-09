import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Every application field except the potentially multi-MB image column.
export const playerSelect = Prisma.validator<Prisma.PlayerSelect>()({
  id: true, name: true, ign: true, points: true, bestPerformance: true,
  notes: true, hallPokemon: true, active: true, createdAt: true, updatedAt: true,
});
export const categorySelect = Prisma.validator<Prisma.CategorySelect>()({
  id: true, name: true, description: true, createdAt: true,
});
export type MediaMetadata = {
  type: "player" | "category" | "setting";
  id: string;
  version: string | null;
  url: string | null;
};

export async function getMediaMetadata() {
  // Hash stored images inside Postgres. Only small versions/URLs cross the network.
  // Includes inactive players, because their historical matches still display PFPs.
  // PostgreSQL's built-in sha256 matches mediaVersion() without an extension/schema change.
  return db.$queryRaw<MediaMetadata[]>`
    WITH sources AS (
      SELECT 'player'::text AS type, id, image AS value FROM public."Player"
      UNION ALL
      SELECT 'category'::text AS type, id, image AS value FROM public."Category"
      UNION ALL
      SELECT 'setting'::text AS type, key AS id, value FROM public."Setting"
      WHERE key IN ('background', 'logo', 'pokecompare_art')
    )
    SELECT type, id,
      CASE WHEN value IS NOT NULL AND value <> ''
        THEN left(encode(sha256(convert_to(value, 'UTF8')), 'hex'), 16)
        ELSE NULL END AS version,
      CASE WHEN value ~* '^https?://' THEN value ELSE NULL END AS url
    FROM sources
  `;
}

export function metadataMediaUrl(metadata: MediaMetadata | undefined) {
  if (!metadata?.version) return null;
  if (metadata.url) return metadata.url;
  const params = new URLSearchParams({ type: metadata.type });
  params.set(metadata.type === "setting" ? "key" : "id", metadata.id);
  params.set("v", metadata.version);
  return `/api/media?${params}`;
}
