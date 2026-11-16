import React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errorMessage, unwrap } from "@/lib/api";
import { Spinner, useQuery } from "@/lib/hooks";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/form";
import logo from "@/logo.png";

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-sm rounded-lg bg-card p-7 shadow-2xl">
        <img src={logo} alt="Best Builders & Developers" className="mb-5 h-12 w-12 object-contain" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await unwrap(api.auth.login.$post({ json: { username, password } }));
      toast.success("Logged in");
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame title="Sign in to the Best Builders dashboard" subtitle="Prospects, properties, website listings and search analytics in one place.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Username">
          <Input autoComplete="username" placeholder="you@company.com" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" pending={pending} className="mt-1">
          Log in
        </Button>
      </form>
    </AuthFrame>
  );
}

export function AcceptInvitePage({ onSignedIn }: { onSignedIn: () => void }) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const invite = useQuery(() => unwrap(api.auth.invite.$get({ query: { token } })), token);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setError("The passwords don't match");
    setPending(true);
    setError(null);
    try {
      await unwrap(api.auth.invite.accept.$post({ json: { token, password } }));
      window.history.replaceState(null, "", "/");
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (invite.status === "loading") return <AuthFrame title="Accept invitation" subtitle="Checking your invitation…"><Spinner className="py-4" /></AuthFrame>;
  if (invite.status === "error") return <AuthFrame title="Accept invitation" subtitle={invite.message}><a className="text-sm font-medium underline" href="/">Go to sign in</a></AuthFrame>;
  return (
    <AuthFrame title="Accept invitation" subtitle={`Create a password for ${invite.data.email}.`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        <Field label="Confirm password">
          <Input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" pending={pending}>
          Accept invitation
        </Button>
      </form>
    </AuthFrame>
  );
}
