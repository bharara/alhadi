import { PROSPECT_STATUSES, TOUCH_KINDS, type ProspectStatus, type TouchKind } from "@worker/prospects/fields";

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  cold: "Cold",
  warm: "Warm",
  interested: "Interested",
  do_not_contact: "Do Not Contact",
};

export const STATUS_OPTIONS = PROSPECT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));

export const STATUS_TONES: Record<ProspectStatus, "info" | "warning" | "success" | "danger"> = {
  cold: "info",
  warm: "warning",
  interested: "success",
  do_not_contact: "danger",
};

export const TOUCH_KIND_LABELS: Record<TouchKind, string> = { email: "Email", call: "Call", visit: "Visit", whatsapp: "WhatsApp" };

export const TOUCH_KIND_OPTIONS = TOUCH_KINDS.map((value) => ({ value, label: TOUCH_KIND_LABELS[value] }));

const CALL_STATUSES = ["did_not_attend", "call_back", "interested", "asked_info", "not_interested", "do_not_contact", "other"] as const;
export const callStatusLabel = (value: string | null | undefined) => (value ? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
export const CALL_STATUS_OPTIONS = CALL_STATUSES.map((value) => ({ value, label: callStatusLabel(value) }));
