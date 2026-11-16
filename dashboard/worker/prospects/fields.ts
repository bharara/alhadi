import { z } from "zod";
import { ApiError } from "../http";
import { isoInstant } from "../validation";

export const PROSPECT_STATUSES = ["cold", "warm", "interested", "do_not_contact"] as const;
export const TOUCH_KINDS = ["email", "call", "visit", "whatsapp"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export type TouchKind = (typeof TOUCH_KINDS)[number];

const SECONDARY_PHONES_KEY = "secondary_phone_numbers";

const RESERVED_EXTRA_KEYS = new Set([
  "id", "created_at", "updated_at", "user_id", "email", "name", "company", "title", "phone", "tags", "tag", "notes",
  "assigned", "assignee", "assigned_user", "assigned_user_id", "status", "next_touch_at", "extra",
]);

const CANONICAL_TAGS: Record<string, string> = { "sitara villas": "Sitara Villas", "sitara villas new": "Sitara Villas New" };

/** Fields a create, import or update may send; absent keys are left alone. */
export const prospectFieldsSchema = z.object({
  phone: z.string().min(1).max(64),
  email: z.string().max(320).nullish(),
  name: z.string().max(255).nullish(),
  title: z.string().max(255).nullish(),
  company: z.string().max(255).nullish(),
  notes: z.string().max(20000).nullish(),
  tags: z.array(z.string().max(255)).max(100).nullish(),
  extra: z.record(z.string(), z.unknown()).nullish(),
  status: z.enum(PROSPECT_STATUSES).nullish(),
  assigned_user_id: z.string().max(64).nullish(),
  next_touch_at: isoInstant.nullish(),
});
export type ProspectFieldsInput = Partial<Omit<z.infer<typeof prospectFieldsSchema>, "phone">> & { phone?: string | null };

/** Normalized column values, only for the keys that were sent. tags and extra are JSON text. */
export type ProspectColumns = Partial<{
  phone: string;
  email: string | null;
  name: string | null;
  title: string | null;
  company: string | null;
  notes: string | null;
  tags: string;
  extra: string;
  status: ProspectStatus;
  assigned_user_id: string | null;
  next_touch_at: string | null;
}>;

// propCRM's rules; `baseExtra` (the stored extra) receives secondary phones when extra itself wasn't sent.
export function normalizeProspectFields(input: ProspectFieldsInput, baseExtra: Record<string, unknown> | null = null): ProspectColumns {
  const out: ProspectColumns = {};
  if (input.email !== undefined) out.email = input.email?.trim().toLowerCase() || null;
  for (const key of ["name", "title", "company", "notes"] as const) {
    if (input[key] !== undefined) out[key] = input[key]?.trim() || null;
  }
  if (input.tags !== undefined) out.tags = JSON.stringify(normalizeTags(input.tags ?? []));
  if (input.status !== undefined && input.status !== null) out.status = input.status;
  if (input.assigned_user_id !== undefined) out.assigned_user_id = input.assigned_user_id || null;
  if (input.next_touch_at !== undefined) out.next_touch_at = input.next_touch_at ?? null;

  let extra = input.extra !== undefined ? sanitizeExtra(input.extra ?? {}) : null;
  if (input.phone !== undefined && input.phone !== null) {
    const { primary, secondary } = normalizePhoneOrThrow(input.phone);
    out.phone = primary;
    if (secondary) extra = mergeSecondaryPhones(extra ?? baseExtra ?? {}, secondary);
  }
  if (extra) out.extra = JSON.stringify(extra);
  return out;
}

export function normalizePhoneOrThrow(raw: string): { primary: string; secondary: string | null } {
  try {
    return normalizeProspectPhone(raw);
  } catch (error) {
    throw new ApiError(422, `phone: ${(error as Error).message}`);
  }
}

function normalizeProspectPhone(raw: string): { primary: string; secondary: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Phone is required");
  if (/[a-zA-Z]/.test(trimmed)) throw new Error("Phone must not contain letters");
  const parts = trimmed
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Phone is required");
  const normalized = parts.map(normalizeSinglePhone);
  return { primary: normalized[0]!, secondary: normalized.length > 1 ? normalized.slice(1).join(",") : null };
}

function normalizeSinglePhone(part: string): string {
  let digits = part.replace(/\D/g, "");
  if (!digits) throw new Error("Phone is required");
  if (digits.startsWith("0092")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("92")) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) digits = `0${digits}`;
  if (digits.length < 7 || digits.length > 15) throw new Error("Phone must contain 7 to 15 digits");
  return digits;
}

function mergeSecondaryPhones(extra: Record<string, unknown>, secondary: string): Record<string, unknown> {
  const existing = typeof extra[SECONDARY_PHONES_KEY] === "string" ? (extra[SECONDARY_PHONES_KEY] as string).split(",") : [];
  const merged = [...new Set([...existing, ...secondary.split(",")].map((p) => p.trim()).filter(Boolean))];
  return { ...extra, [SECONDARY_PHONES_KEY]: merged.join(",") };
}

function canonicalizeTag(raw: string): string {
  const tag = raw.trim();
  return CANONICAL_TAGS[tag.toLowerCase()] ?? tag;
}

/** Canonical spellings, blanks dropped, case-insensitive dedupe keeping the first spelling. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = canonicalizeTag(raw);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function sanitizeExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    const normalized = key.trim().toLowerCase().replace(/-/g, "_");
    if (!normalized || RESERVED_EXTRA_KEYS.has(normalized)) continue;
    out[key.trim()] = value;
  }
  return out;
}
