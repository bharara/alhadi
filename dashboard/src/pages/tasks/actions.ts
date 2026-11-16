import type { ProspectStatus, TouchKind } from "@/lib/labels";

/** The body of POST /prospects/:id/task-action. */
export type TaskPayload = {
  kind: TouchKind;
  call_status?: string;
  summary?: string;
  status?: ProspectStatus;
  next_touch_at?: string;
  clear_next_touch?: boolean;
};

export type TaskButton = {
  label: string;
  payload: TaskPayload;
  variant?: "primary" | "outline" | "danger";
  /** Opens a dialog to add notes, a status or a next touch before saving. */
  modal?: boolean;
};

export const CALL_BUTTONS: TaskButton[] = [
  { label: "Did not attend", payload: { kind: "call", call_status: "did_not_attend", summary: "Did not attend" } },
  { label: "Interested", variant: "primary", payload: { kind: "call", call_status: "interested", summary: "Interested", status: "interested", clear_next_touch: true } },
  { label: "Asked info", modal: true, payload: { kind: "call", call_status: "asked_info", summary: "Asked info", status: "warm" } },
  { label: "Not interested", payload: { kind: "call", call_status: "not_interested", summary: "Not interested", status: "cold", clear_next_touch: true } },
  { label: "Do not contact", variant: "danger", payload: { kind: "call", call_status: "do_not_contact", summary: "Do not contact", status: "do_not_contact", clear_next_touch: true } },
  { label: "Other", modal: true, payload: { kind: "call", call_status: "other" } },
];

export const CALL_BACK: TaskPayload = { kind: "call", call_status: "call_back", summary: "Call back scheduled" };

export const WHATSAPP_BUTTONS: TaskButton[] = [
  { label: "Interested", variant: "primary", payload: { kind: "whatsapp", call_status: "interested", summary: "Interested", status: "interested", clear_next_touch: true } },
  { label: "Asked info", modal: true, payload: { kind: "whatsapp", call_status: "asked_info", summary: "Asked info", status: "warm" } },
  { label: "Do not contact", payload: { kind: "whatsapp", call_status: "do_not_contact", summary: "Do not contact", status: "do_not_contact", clear_next_touch: true } },
  { label: "Other", modal: true, payload: { kind: "whatsapp", call_status: "other" } },
  // Unlike the call tab, a WhatsApp "not interested" means stop messaging them.
  { label: "Not interested", variant: "danger", payload: { kind: "whatsapp", call_status: "not_interested", summary: "Not interested", status: "do_not_contact", clear_next_touch: true } },
];
