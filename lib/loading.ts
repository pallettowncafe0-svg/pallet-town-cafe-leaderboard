import { db } from "./db";
import { metadataMediaUrl, type MediaMetadata } from "./leaderboard-data";

export type LoadingConfig = { image: string | null; blend: boolean };

export async function loadingConfig(): Promise<LoadingConfig> {
  // Return only a version/URL while hashing the GIF inside Postgres. The GIF
  // bytes are served separately through the existing versioned media cache.
  const [media, appearance] = await Promise.all([
    db.$queryRaw<MediaMetadata[]>`
      SELECT 'setting'::text AS type, key AS id,
        left(encode(sha256(convert_to(value, 'UTF8')), 'hex'), 16) AS version,
        CASE WHEN value ~* '^https?://' THEN value ELSE NULL END AS url
      FROM public."Setting" WHERE key = 'loading_gif' AND value <> ''
    `,
    db.setting.findUnique({ where: { key: "loading_gif_blend" }, select: { value: true } }),
  ]);
  return { image: metadataMediaUrl(media.find(item => item.id === "loading_gif")), blend: appearance?.value !== "false" };
}
