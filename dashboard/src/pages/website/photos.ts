import { RequestError } from "@/lib/api";

export const MAX_PHOTOS = 30;
const FULL = 1600;
const THUMB = 600;

type Variant = { blob: Blob; width: number; height: number };

/** Resizes in the browser so the Worker only stores files: a ≤1600px full image and a ≤600px thumbnail, both WebP. */
export async function preparePhoto(file: File): Promise<{ full: Variant; thumb: Variant }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name} isn't an image this browser can read`);
  }
  try {
    return { full: await encode(bitmap, FULL, 0.82), thumb: await encode(bitmap, THUMB, 0.8) };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Variant> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize images");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  // Old Safari falls back to PNG for unsupported types; the Worker only accepts WebP.
  if (!blob || blob.type !== "image/webp") throw new Error("This browser can't save WebP images. Try Chrome, Edge or a recent Safari.");
  return { blob, width, height };
}

export type UploadedPhoto = { id: string; width: number; height: number; alt: string | null; sort_order: number; full: string; thumb: string };

export async function uploadPhoto(listingId: string, file: File, alt: string): Promise<UploadedPhoto[]> {
  const { full, thumb } = await preparePhoto(file);
  const form = new FormData();
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  form.append("full", new File([full.blob], `${base}-1600.webp`, { type: "image/webp" }));
  form.append("thumb", new File([thumb.blob], `${base}-600.webp`, { type: "image/webp" }));
  form.append("width", String(full.width));
  form.append("height", String(full.height));
  if (alt.trim()) form.append("alt", alt.trim());
  const response = await fetch(`/api/crm/listings/${encodeURIComponent(listingId)}/photos`, { method: "POST", body: form, credentials: "include" });
  const data = (await response.json().catch(() => null)) as { detail?: string; photos?: UploadedPhoto[] } | null;
  if (!response.ok || !data?.photos) throw new RequestError(data?.detail || `Upload failed (${response.status})`, response.status);
  return data.photos;
}
