import type { Element, HTMLRewriter as Rewriter } from "@cloudflare/workers-types";

// HTMLRewriter is a Workers global; the project's types come from @cloudflare/workers-types as a module.
declare const HTMLRewriter: typeof Rewriter;

/** Tags the editor produces, each with the attributes it may keep. Anything else is unwrapped (its text kept). */
const ALLOWED: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  h2: [],
  h3: [],
  h4: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  code: [],
  pre: [],
  blockquote: [],
  ul: [],
  ol: ["start"],
  li: [],
  a: ["href", "target"],
  img: ["src", "alt", "width", "height"],
};

/** Removed together with everything inside them. */
const DROPPED = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "form", "input", "button", "select", "textarea", "head", "title", "link", "meta", "base"]);

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

/**
 * Cleans editor HTML down to a fixed set of tags and attributes before it is stored. The landing build renders
 * `body_html` as-is, so this is the only thing between the editor and the public site.
 */
export async function sanitizeArticleHtml(html: string, mediaUrl: string, articleId: string): Promise<string> {
  // Article images are deleted with their article, so only this article's own uploads may appear in it.
  const imagePrefix = `${mediaUrl.replace(/\/$/, "")}/articles/${articleId}/`;
  const rewriter = new HTMLRewriter()
    .on("*", {
      element(el: Element) {
        const tag = el.tagName.toLowerCase();
        if (DROPPED.has(tag)) return void el.remove();
        const allowed = ALLOWED[tag];
        if (!allowed) return void el.removeAndKeepContent();
        for (const [name] of [...el.attributes]) if (!allowed.includes(name!.toLowerCase())) el.removeAttribute(name!);

        if (tag === "a") {
          const href = el.getAttribute("href")?.trim() ?? "";
          if (!SAFE_HREF.test(href)) return void el.removeAndKeepContent();
          if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
          else el.removeAttribute("target");
        }
        if (tag === "img") {
          if (!(el.getAttribute("src") ?? "").startsWith(imagePrefix)) return void el.remove();
          for (const dim of ["width", "height"]) if (!/^\d{1,4}$/.test(el.getAttribute(dim) ?? "")) el.removeAttribute(dim);
          el.setAttribute("loading", "lazy");
          el.setAttribute("decoding", "async");
        }
        if (tag === "ol" && !/^\d{1,4}$/.test(el.getAttribute("start") ?? "")) el.removeAttribute("start");
      },
    })
    .onDocument({
      comments(comment) {
        comment.remove();
      },
    });
  const out = await rewriter.transform(new Response(html) as never).text();
  // Empty paragraphs the editor leaves at the end aren't content.
  return out.replace(/(<p>\s*<\/p>\s*)+$/g, "").trim();
}

/** Plain text of sanitised HTML, for word counts. */
export const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
