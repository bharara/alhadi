import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";

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

type Uploaded = InferResponseType<(typeof crm.inventory)[":id"]["photos"]["$post"], 201>;

// Multipart isn't modelled by the typed client, so this posts the form directly.
export async function uploadPhoto(propertyId: string, file: File): Promise<Uploaded["photos"]> {
  const { full, thumb } = await preparePhoto(file);
  const form = new FormData();
  form.append("full", new File([full.blob], "full.webp", { type: "image/webp" }));
  form.append("thumb", new File([thumb.blob], "thumb.webp", { type: "image/webp" }));
  form.append("width", String(full.width));
  form.append("height", String(full.height));
  const response = fetch(`/api/crm/inventory/${encodeURIComponent(propertyId)}/photos`, { method: "POST", body: form, credentials: "include" });
  return (await unwrap(response as Promise<Response & { json(): Promise<Uploaded> }>)).photos;
}
