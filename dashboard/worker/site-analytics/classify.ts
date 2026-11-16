import type { Channel } from "./fields";

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave)\./;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|youtube|tiktok|pinterest|reddit|snapchat|threads)\.(com|co|me|net)$/;
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|meta\.ai)$/;
const WHATSAPP = /(^|\.)(whatsapp\.com|wa\.me)$/;
const EMAIL = /(^|\.)(mail\.google\.com|outlook\.live\.com|mail\.yahoo\.com)$|^mail\./;
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_social", "paidsocial", "display", "ads"]);

export type Utm = { source?: string | null; medium?: string | null; campaign?: string | null };

/** Where a visit came from, from its landing referrer and UTM tags. */
export function classify(referrer: string | null | undefined, utm: Utm | null | undefined, siteHost: string): { channel: Channel; source: string | null } {
  const host = hostOf(referrer);
  const external = host && host !== siteHost && !host.endsWith(`.${siteHost}`) ? host : null;
  const medium = utm?.medium?.toLowerCase() ?? "";
  const utmSource = utm?.source?.toLowerCase() || null;
  const source = utmSource ?? external;

  if (PAID_MEDIUMS.has(medium)) return { channel: "paid", source };
  if (utmSource === "whatsapp" || (external && WHATSAPP.test(external))) return { channel: "whatsapp", source };
  if (medium === "email" || (external && EMAIL.test(external))) return { channel: "email", source };
  if (medium === "social" || (external && SOCIAL.test(external))) return { channel: "social", source };
  if (external && AI.test(external)) return { channel: "ai", source };
  if (medium === "organic" || (external && SEARCH.test(external))) return { channel: "organic_search", source };
  if (external || utmSource) return { channel: "referral", source };
  return { channel: "direct", source: null };
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|curl|wget|python|httpclient|monitor|uptime/i;
export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent);

export function device(userAgent: string, width: number | null | undefined): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet/i.test(userAgent) || (width && width >= 600 && width < 1024 && /android/i.test(userAgent))) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function browser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\/|opera/i.test(userAgent)) return "Opera";
  if (/samsungbrowser/i.test(userAgent)) return "Samsung Internet";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Other";
}
