import React from "react";
import type { Me } from "@/lib/api";

const SessionContext = React.createContext<{ user: Me; signOut: () => void } | null>(null);

export const SessionProvider = SessionContext.Provider;

/** The signed-in user; only available inside the signed-in app. */
export function useSession() {
  const session = React.useContext(SessionContext);
  if (!session) throw new Error("useSession outside the signed-in app");
  return session;
}
