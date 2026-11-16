import React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { errorMessage, isSignedOut } from "./api";

type QueryState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T; refreshing: boolean };

export type Query<T> = QueryState<T> & {
  retry: () => void;
  /** Replaces the loaded data with what a write returned. */
  setData: (update: (data: T) => T) => void;
};

/** Loads on mount and whenever `key` changes; the last data stays on screen while a new key loads. */
export function useQuery<T>(load: () => Promise<T>, key: unknown = null): Query<T> {
  const [state, setState] = React.useState<QueryState<T>>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  const keyText = JSON.stringify(key);

  React.useEffect(() => {
    let alive = true;
    setState((current) => (current.status === "ready" ? { ...current, refreshing: true } : { status: "loading" }));
    load().then(
      (data) => alive && setState({ status: "ready", data, refreshing: false }),
      (error: unknown) => alive && !isSignedOut(error) && setState({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is usually inline; reload on `key` only.
  }, [keyText, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  const setData = React.useCallback(
    (update: (data: T) => T) => setState((current) => (current.status === "ready" ? { ...current, data: update(current.data) } : current)),
    [],
  );
  return { ...state, retry, setData };
}

export const dataOr = <T,>(query: Query<T>, fallback: T): T => (query.status === "ready" ? query.data : fallback);

export function QueryView<T>({ query, children }: { query: Query<T>; children: (data: T) => React.ReactNode }) {
  if (query.status === "loading") return <Spinner />;
  if (query.status === "error")
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
        <p className="font-medium text-destructive">{query.message}</p>
        <Button variant="outline" onClick={query.retry}>
          Try again
        </Button>
      </div>
    );
  return <>{children(query.data)}</>;
}

export function Spinner({ className = "py-16" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`} role="status" aria-label="Loading">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

function showError(error: unknown): void {
  if (!isSignedOut(error)) toast.error(errorMessage(error));
}

/** Runs a write, shows its error as a toast, and resolves to whether it succeeded. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      try {
        return await action(...args);
      } catch (error) {
        showError(error);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return { run, pending };
}

/** Reads and writes URL search params as a plain object; empty values are dropped. */
export function useSearchState<K extends string>(): [Partial<Record<K, string>>, (next: Partial<Record<K, string | null | undefined>>, replace?: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const value = Object.fromEntries(params.entries()) as Partial<Record<K, string>>;
  const update = (next: Partial<Record<K, string | null | undefined>>, replace = false) => {
    const merged = new URLSearchParams(replace ? undefined : params);
    for (const [k, v] of Object.entries(next) as [string, string | null | undefined][]) {
      if (v === null || v === undefined || v === "") merged.delete(k);
      else merged.set(k, v);
    }
    setParams(merged);
  };
  return [value, update];
}
