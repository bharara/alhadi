import { z } from "zod";
import { ApiError } from "../http";
import { optionalText } from "../validation";

const MAX_BYTES = 4 * 1024 * 1024;

const webp = z.instanceof(File).refine((f) => f.type === "image/webp" && f.size > 0 && f.size <= MAX_BYTES);

const upload = z.object({
  full: webp,
  thumb: webp,
  width: z.coerce.number().int().min(1).max(4000),
  height: z.coerce.number().int().min(1).max(4000),
  alt: optionalText(200),
});

/** An image the browser already resized to WebP (src/lib/images.ts), posted as multipart. */
export async function readImageUpload(request: { formData(): Promise<FormData> }) {
  const parsed = upload.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) throw new ApiError(422, "Upload WebP images under 4 MB (the dashboard converts images for you)");
  return parsed.data;
}
