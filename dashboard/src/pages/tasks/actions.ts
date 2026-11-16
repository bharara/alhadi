import type { InferRequestType } from "hono/client";
import type { crm } from "@/lib/api";

export type TaskPayload = InferRequestType<(typeof crm.prospects)[":id"]["task-action"]["$post"]>["json"];

export type TaskButton = {
  label: string;
  payload: TaskPayload;
  variant?: "primary" | "outline" | "danger";
  /** Opens a dialog to add notes, a status or a next touch before saving. */
  modal?: boolean;
};

export const CALL_BUTTONS: TaskButton[] = [
  { label: "Did not attend", payload: { kind: "call", call_status: "did_not_attend", summary: "Did not attend" } },
  { label: "Interested", variant: "primary", payload: { kind: "call", call_status: "interested", summary: "Interested", status: "interested", next_touch_at: null } },
  { label: "Asked info", modal: true, payload: { kind: "call", call_status: "asked_info", summary: "Asked info", status: "warm" } },
  { label: "Not interested", payload: { kind: "call", call_status: "not_interested", summary: "Not interested", status: "cold", next_touch_at: null } },
  { label: "Do not contact", variant: "danger", payload: { kind: "call", call_status: "do_not_contact", summary: "Do not contact", status: "do_not_contact", next_touch_at: null } },
  { label: "Other", modal: true, payload: { kind: "call", call_status: "other" } },
];

export const CALL_BACK: TaskPayload = { kind: "call", call_status: "call_back", summary: "Call back scheduled" };

export const WHATSAPP_BUTTONS: TaskButton[] = [
  { label: "Interested", variant: "primary", payload: { kind: "whatsapp", call_status: "interested", summary: "Interested", status: "interested", next_touch_at: null } },
  { label: "Asked info", modal: true, payload: { kind: "whatsapp", call_status: "asked_info", summary: "Asked info", status: "warm" } },
  { label: "Do not contact", payload: { kind: "whatsapp", call_status: "do_not_contact", summary: "Do not contact", status: "do_not_contact", next_touch_at: null } },
  { label: "Other", modal: true, payload: { kind: "whatsapp", call_status: "other" } },
  // Unlike the call tab, a WhatsApp "not interested" means stop messaging them.
  { label: "Not interested", variant: "danger", payload: { kind: "whatsapp", call_status: "not_interested", summary: "Not interested", status: "do_not_contact", next_touch_at: null } },
];
