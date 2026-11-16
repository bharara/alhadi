import { PROSPECT_STATUSES, TOUCH_KINDS, type ProspectStatus, type TouchKind } from "@worker/prospects/fields";

export { PROSPECT_STATUSES, TOUCH_KINDS };
export type { ProspectStatus, TouchKind };
export { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPE_LABELS, INVENTORY_TYPES, WEBSITE_PROJECTS } from "@worker/inventory/fields";

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  cold: "Cold",
  warm: "Warm",
  interested: "Interested",
  do_not_contact: "Do Not Contact",
};

export const STATUS_TONES: Record<ProspectStatus, "info" | "warning" | "success" | "danger"> = {
  cold: "info",
  warm: "warning",
  interested: "success",
  do_not_contact: "danger",
};

export const TOUCH_KIND_LABELS: Record<TouchKind, string> = { email: "Email", call: "Call", visit: "Visit", whatsapp: "WhatsApp" };

export const CALL_STATUSES = ["did_not_attend", "call_back", "interested", "asked_info", "not_interested", "do_not_contact", "other"] as const;
export const callStatusLabel = (value: string | null | undefined) => (value ? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
