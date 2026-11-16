// Shared by the Worker and the dashboard UI; keep free of runtime imports.
export const EVENT_KINDS = ["pageview", "whatsapp", "call", "form"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const ENQUIRY_KINDS = ["whatsapp", "call", "form"] as const satisfies readonly EventKind[];

export const CHANNELS = ["direct", "organic_search", "paid", "social", "whatsapp", "ai", "email", "referral"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  direct: "Direct",
  organic_search: "Organic search",
  paid: "Paid ads",
  social: "Social",
  whatsapp: "WhatsApp",
  ai: "AI assistants",
  email: "Email",
  referral: "Other websites",
};

export const ENQUIRY_LABELS: Record<(typeof ENQUIRY_KINDS)[number], string> = { whatsapp: "WhatsApp", call: "Call", form: "Lead form" };
