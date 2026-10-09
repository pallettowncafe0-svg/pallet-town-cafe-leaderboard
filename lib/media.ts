import { createHash } from "node:crypto";

export function mediaVersion(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function mediaUrl(path: string, value: string | null | undefined) {
  if (!value) return null;
  // External images already have a URL; preserve it for display and editing.
  if (/^https?:\/\//i.test(value)) return value;
  const url = new URL(path, "http://localhost");
  url.searchParams.set("v", mediaVersion(value));
  return `${url.pathname}${url.search}`;
}

export function publicPlayer<T extends { id: string; image: string | null }>(player: T) {
  const { image, ...fields } = player;
  const imageUrl = mediaUrl(`/api/media?type=player&id=${encodeURIComponent(player.id)}`, image);
  return { ...fields, image: /^https?:\/\//i.test(image || "") ? image : undefined, imageUrl };
}

export function publicCategory<T extends { id: string; image: string | null }>(category: T) {
  return { ...category, image: mediaUrl(`/api/media?type=category&id=${encodeURIComponent(category.id)}`, category.image) };
}

export function editedImage(value: unknown, existing: string | null) {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return existing;
  const image = value.trim();
  // Generated display URLs must never replace the original stored bytes.
  if (image.startsWith("/api/media?")) return existing;
  if (!/^https?:\/\//i.test(image) && !image.startsWith("data:image/")) {
    throw new Error("Use an image URL or upload an image file.");
  }
  return image;
}
