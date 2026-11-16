import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "@worker/app";

const client = hc<AppType>("/");
export const api = client.api;
export const crm = client.api.crm;

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const SIGNED_OUT_EVENT = "bbd:signed-out";

type ClientResponse<T> = { ok: boolean; status: number; url: string; json: () => Promise<T> };

/** Resolves to the JSON body, or throws the Worker's { detail } as a RequestError. A 401 signs the app out. */
export async function unwrap<T>(request: Promise<ClientResponse<T>>): Promise<T> {
  const response = await request;
  if (response.ok) return response.json();
  const data = (await response.json().catch(() => null)) as { detail?: string } | null;
  if (response.status === 401 && !response.url.includes("/api/auth/")) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  throw new RequestError(data?.detail || `Request failed (${response.status})`, response.status);
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
export const isSignedOut = (error: unknown) => error instanceof RequestError && error.status === 401;

// Shared response types.
export type Me = InferResponseType<typeof api.me.$get, 200>["user"];
export type CrmUser = InferResponseType<typeof crm.users.$get, 200>[number];
export type Prospect = InferResponseType<(typeof crm.prospects)[":id"]["$get"], 200>;
export type ProspectSearch = InferResponseType<typeof crm.prospects.search.$post, 200>;
export type Touch = InferResponseType<(typeof crm.prospects)[":id"]["touches"]["$get"], 200>["touches"][number];
export type InventoryItem = InferResponseType<(typeof crm.inventory)[":id"]["$get"], 200>;

export const fetchUsers = () => unwrap(crm.users.$get());
