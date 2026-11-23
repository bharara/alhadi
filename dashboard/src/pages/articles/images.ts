import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";
import { preparePhoto } from "@/pages/inventory/photos";

export type ArticleImage = InferResponseType<(typeof crm.articles)[":id"]["images"]["$post"], 201>;

// Multipart isn't modelled by the typed client, so this posts the form directly.
export async function uploadArticleImage(articleId: string, file: File): Promise<ArticleImage> {
  const { full, thumb } = await preparePhoto(file);
  const form = new FormData();
  form.append("full", new File([full.blob], "full.webp", { type: "image/webp" }));
  form.append("thumb", new File([thumb.blob], "thumb.webp", { type: "image/webp" }));
  form.append("width", String(full.width));
  form.append("height", String(full.height));
  const response = fetch(`/api/crm/articles/${encodeURIComponent(articleId)}/images`, { method: "POST", body: form, credentials: "include" });
  return unwrap(response as Promise<Response & { json(): Promise<ArticleImage> }>);
}
