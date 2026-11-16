import React from "react";
import { Copy, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/form";
import { Badge, Card, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";

const admin = crm["user-management"];
type ManagedUser = InferResponseType<typeof admin.users.$get, 200>[number];
type Invite = InferResponseType<typeof admin.invites.$get, 200>[number];
type Role = ManagedUser["role"];
const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

type Pending =
  | { kind: "role"; user: ManagedUser; role: Role }
  | { kind: "active"; user: ManagedUser; active: boolean }
  | { kind: "revoke"; invite: Invite }
  | null;

export function UsersPage() {
  const users = useQuery(() => unwrap(admin.users.$get()));
  const invites = useQuery(() => unwrap(admin.invites.$get()));
  const [pending, setPending] = React.useState<Pending>(null);
  const [passwordFor, setPasswordFor] = React.useState<ManagedUser | null>(null);
  const [inviting, setInviting] = React.useState(false);
  const [created, setCreated] = React.useState<Invite | null>(null);

  const setRole = useAction((id: string, role: Role) => unwrap(admin.users[":id"].role.$put({ param: { id }, json: { role } })));
  const setActive = useAction((id: string, active: boolean) => unwrap(admin.users[":id"].active.$post({ param: { id }, query: { is_active: active ? "true" : "false" } })));
  const revoke = useAction((id: string) => unwrap(admin.invites[":id"].$delete({ param: { id } })));
  const replaceUser = (next: ManagedUser) => users.setData((list) => list.map((u) => (u.id === next.id ? next : u)));

  async function confirm() {
    if (!pending) return;
    if (pending.kind === "role") {
      const next = await setRole.run(pending.user.id, pending.role);
      if (next) {
        replaceUser(next);
        toast.success(`${next.username} is now ${next.role === "admin" ? "an admin" : "a member"}`);
      }
    } else if (pending.kind === "active") {
      const next = await setActive.run(pending.user.id, pending.active);
      if (next) {
        replaceUser(next);
        toast.success(`${next.username} ${next.is_active ? "activated" : "deactivated"}`);
      }
    } else {
      const id = pending.invite.id;
      if (await revoke.run(id)) {
        invites.setData((list) => list.filter((i) => i.id !== id));
        toast.success("Invitation revoked");
      }
    }
    setPending(null);
  }

  return (
    <>
      <PageHeader
        title="User management"
        lede="Invite teammates and manage who can sign in. Admins can also manage users, website settings and Search Console syncs."
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" /> Invite user
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card title="Users" bodyClassName="p-0">
          <QueryView query={users}>
            {(list) => <UsersTable users={list} onRole={(user, role) => setPending({ kind: "role", user, role })} onActive={(user, active) => setPending({ kind: "active", user, active })} onPassword={setPasswordFor} />}
          </QueryView>
        </Card>

        <Card title="Pending invitations" bodyClassName="p-0">
          <QueryView query={invites}>
            {(list) =>
              list.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No pending invitations">Invite a teammate and send them the link.</EmptyState>
                </div>
              ) : (
                <Table className="rounded-none border-0">
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Expires</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((invite) => (
                      <Tr key={invite.id}>
                        <Td>{invite.email}</Td>
                        <Td className="capitalize">{invite.role}</Td>
                        <Td className="whitespace-nowrap">{formatDate(invite.expires_at)}</Td>
                        <Td>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => copyLink(invite.invite_url)}>
                              <Copy className="h-3.5 w-3.5" /> Copy link
                            </Button>
                            <Button variant="danger-outline" size="sm" onClick={() => setPending({ kind: "revoke", invite })}>
                              Revoke
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )
            }
          </QueryView>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "role"
            ? `Make ${pending.user.username} ${pending.role === "admin" ? "an admin" : "a member"}?`
            : pending?.kind === "active"
              ? `${pending.active ? "Activate" : "Deactivate"} ${pending.user.username}?`
              : "Revoke this invitation?"
        }
        body={
          pending?.kind === "role"
            ? pending.role === "admin"
              ? "Admins can manage users, website settings and Search Console syncs."
              : "They will lose access to user management and website settings."
            : pending?.kind === "active"
              ? pending.active
                ? "They will be able to sign in again."
                : "They will be signed out and can't sign in until reactivated. Their prospects stay assigned to them."
              : pending?.kind === "revoke"
                ? `The link sent to ${pending.invite.email} will stop working.`
                : null
        }
        confirmLabel={pending?.kind === "role" ? "Change role" : pending?.kind === "active" ? (pending.active ? "Activate" : "Deactivate") : "Revoke"}
        danger={pending?.kind === "revoke" || (pending?.kind === "active" && !pending.active)}
        pending={setRole.pending || setActive.pending || revoke.pending}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />

      <PasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />
      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onCreated={(invite) => {
          invites.setData((list) => [...list.filter((i) => i.email !== invite.email), invite]);
          setInviting(false);
          setCreated(invite);
        }}
      />
      <InviteLinkDialog invite={created} onClose={() => setCreated(null)} />
    </>
  );
}

function UsersTable({
  users,
  onRole,
  onActive,
  onPassword,
}: {
  users: ManagedUser[];
  onRole: (user: ManagedUser, role: Role) => void;
  onActive: (user: ManagedUser, active: boolean) => void;
  onPassword: (user: ManagedUser) => void;
}) {
  const { user: me } = useSession();
  return (
    <Table className="rounded-none border-0">
      <thead>
        <tr>
          <Th>User</Th>
          <Th>Role</Th>
          <Th>Status</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const self = user.id === me.id;
          return (
            <Tr key={user.id}>
              <Td className="align-middle">
                {user.username}
                {self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
              </Td>
              <Td className="align-middle">
                <Select aria-label={`Role for ${user.username}`} value={user.role} options={ROLE_OPTIONS} disabled={self} onChange={(e) => onRole(user, e.target.value as Role)} className="w-32" />
              </Td>
              <Td className="align-middle">{user.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</Td>
              <Td className="align-middle">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={!user.is_active} onClick={() => onPassword(user)}>
                    Set password
                  </Button>
                  <Button variant={user.is_active ? "danger-outline" : "outline"} size="sm" disabled={self} onClick={() => onActive(user, !user.is_active)}>
                    {user.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function PasswordDialog({ user, onClose }: { user: ManagedUser | null; onClose: () => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const save = useAction((id: string, value: string) => unwrap(admin.users[":id"].password.$put({ param: { id }, json: { password: value } })));
  React.useEffect(() => {
    setPassword("");
    setConfirm("");
    setError(null);
  }, [user]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (password !== confirm) return setError("The passwords don't match");
    if (await save.run(user.id, password)) {
      toast.success(`Password set for ${user.username}`);
      onClose();
    }
  }

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={`Set password for ${user?.username ?? ""}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="set-password-form" pending={save.pending}>
            Set password
          </Button>
        </>
      }
    >
      <form id="set-password-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm password">
          <Input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Dialog>
  );
}

function InviteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (invite: Invite) => void }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("member");
  const create = useAction(() => unwrap(admin.invites.$post({ json: { email, role } })));
  React.useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("member");
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const invite = await create.run();
    if (invite) onCreated(invite);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite user"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" pending={create.pending}>
            Create invitation
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" required hint="This becomes their username.">
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Role">
          <Select value={role} options={ROLE_OPTIONS} onChange={(e) => setRole(e.target.value as Role)} />
        </Field>
      </form>
    </Dialog>
  );
}

function InviteLinkDialog({ invite, onClose }: { invite: Invite | null; onClose: () => void }) {
  const whatsapp = invite
    ? `https://wa.me/?text=${encodeURIComponent(`You're invited to the Best Builders dashboard. Set your password here (link expires in 7 days): ${invite.invite_url}`)}`
    : "";
  return (
    <Dialog open={invite !== null} onClose={onClose} title="Invitation created" footer={<Button onClick={onClose}>Done</Button>}>
      {invite && (
        <div className="flex flex-col gap-4 text-sm">
          <p>
            No email is sent. Share this link with <b>{invite.email}</b>. It expires in 7 days and works once.
          </p>
          <Input readOnly value={invite.invite_url} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => copyLink(invite.invite_url)}>
              <Copy className="h-4 w-4" /> Copy link
            </Button>
            <a href={whatsapp} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 hover:bg-muted">
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </a>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function copyLink(url: string) {
  navigator.clipboard.writeText(url).then(
    () => toast.success("Link copied"),
    () => toast.error("Couldn't copy. Select the link and copy it manually."),
  );
}
