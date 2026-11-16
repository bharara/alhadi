import React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { crm, unwrap, type CrmUser, type Prospect, type Touch } from "@/lib/api";
import { formatWhen, fromLocalInput, toLocalInput } from "@/lib/format";
import { QueryView, useAction, useQuery } from "@/lib/hooks";
import { CALL_STATUSES, callStatusLabel, TOUCH_KIND_LABELS, type ProspectStatus, type TouchKind } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Field, Input, Select, TagsInput, Textarea } from "@/ui/form";
import { Card, ConfirmDialog, Dialog, EmptyState, PageHeader } from "@/ui/layout";
import { KIND_OPTIONS, loadTags, STATUS_OPTIONS, StatusBadge, useCrmUsers, userOptions, useStringList } from "./shared";

type ExtraRow = { key: string; value: string };
type Form = {
  phone: string;
  email: string;
  name: string;
  company: string;
  title: string;
  assigned_user_id: string;
  tags: string[];
  status: ProspectStatus;
  next_touch_at: string;
  notes: string;
  extra: ExtraRow[];
};

const extraToText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** Values that read as JSON (numbers, booleans, objects) are stored as JSON; everything else as text. */
function textToExtra(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const formOf = (p: Prospect): Form => ({
  phone: p.phone,
  email: p.email ?? "",
  name: p.name ?? "",
  company: p.company ?? "",
  title: p.title ?? "",
  assigned_user_id: p.assigned_user_id ?? "",
  tags: p.tags,
  status: p.status,
  next_touch_at: p.next_touch_at ?? "",
  notes: p.notes ?? "",
  extra: Object.entries(p.extra).map(([key, value]) => ({ key, value: extraToText(value) })),
});

export function ProspectDetailPage() {
  const { prospectId = "" } = useParams();
  const query = useQuery(() => unwrap(crm.prospects[":id"].$get({ param: { id: prospectId } })), prospectId);
  return <QueryView query={query}>{(prospect) => <ProspectDetail key={prospect.id} prospect={prospect} onSaved={(p) => query.setData(() => p)} />}</QueryView>;
}

function ProspectDetail({ prospect, onSaved }: { prospect: Prospect; onSaved: (p: Prospect) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? "/prospects";
  const users = useCrmUsers();
  const tagSuggestions = useStringList(loadTags);
  const [form, setForm] = React.useState<Form>(() => formOf(prospect));
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useAction(() => {
    const extra: Record<string, unknown> = {};
    for (const row of form.extra) if (row.key.trim()) extra[row.key.trim()] = textToExtra(row.value);
    return unwrap(
      crm.prospects[":id"].$patch({
        param: { id: prospect.id },
        json: {
          phone: form.phone,
          email: form.email || null,
          name: form.name || null,
          company: form.company || null,
          title: form.title || null,
          assigned_user_id: form.assigned_user_id || null,
          tags: form.tags,
          status: form.status,
          next_touch_at: form.next_touch_at || null,
          notes: form.notes || null,
          extra,
        },
      }),
    );
  });
  const remove = useAction(() => unwrap(crm.prospects[":id"].$delete({ param: { id: prospect.id } })));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const saved = await save.run();
    if (!saved) return;
    toast.success("Prospect saved");
    onSaved(saved);
    setForm(formOf(saved));
  }

  async function removeLead() {
    if (!(await remove.run())) return;
    toast.success("Lead removed");
    navigate("/prospects");
  }

  return (
    <>
      <PageHeader
        crumbs={
          <>
            <Link to={backTo} className="hover:underline">
              CRM / Prospects
            </Link>{" "}
            / Profile
          </>
        }
        title={prospect.name || prospect.email || prospect.phone || prospect.company || "Prospect"}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={prospect.status} /> Edit fields and custom attributes, and log touches.
          </span>
        }
        actions={
          <>
            <Button variant="danger-outline" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="h-4 w-4" /> Remove lead
            </Button>
            <Button type="submit" form="prospect-form" pending={save.pending}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Profile">
          <form id="prospect-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" required hint="Extra numbers after a comma are kept in custom fields">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" required />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Assigned user">
              <Select options={userOptions(users)} placeholder="Unassigned" value={form.assigned_user_id} onChange={(e) => set("assigned_user_id", e.target.value)} />
            </Field>
            <Field label="Status">
              <Select options={STATUS_OPTIONS} value={form.status} onChange={(e) => set("status", e.target.value as ProspectStatus)} />
            </Field>
            <Field label="Next touch">
              <Input type="datetime-local" value={toLocalInput(form.next_touch_at)} onChange={(e) => set("next_touch_at", fromLocalInput(e.target.value) ?? "")} />
            </Field>
            <Field label="Tags" className="sm:col-span-2">
              <TagsInput value={form.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-medium">Custom fields</span>
              {form.extra.map((row, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    aria-label="Field name"
                    placeholder="Field"
                    value={row.key}
                    className="w-2/5"
                    onChange={(e) => set("extra", form.extra.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))}
                  />
                  <Input
                    aria-label="Value"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => set("extra", form.extra.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
                  />
                  <Button variant="ghost" size="icon" aria-label="Remove field" onClick={() => set("extra", form.extra.filter((_, i) => i !== index))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="self-start" onClick={() => set("extra", [...form.extra, { key: "", value: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add field
              </Button>
            </div>
          </form>
        </Card>
        <TouchesPanel prospectId={prospect.id} users={users} onChanged={() => void unwrap(crm.prospects[":id"].$get({ param: { id: prospect.id } })).then(onSaved, () => undefined)} />
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove this lead?"
        body="All touches for this lead will be removed. This cannot be undone."
        confirmLabel="Remove lead"
        danger
        pending={remove.pending}
        onConfirm={removeLead}
        onClose={() => setConfirmRemove(false)}
      />
    </>
  );
}

function TouchesPanel({ prospectId, onChanged }: { prospectId: string; users: CrmUser[]; onChanged: () => void }) {
  const [version, setVersion] = React.useState(0);
  const query = useQuery(() => unwrap(crm.prospects[":id"].touches.$get({ param: { id: prospectId } })), [prospectId, version]);
  const [editing, setEditing] = React.useState<Touch | "new" | null>(null);

  return (
    <Card
      title="Touches"
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> Add touch
        </Button>
      }
    >
      <QueryView query={query}>
        {({ touches }) =>
          touches.length === 0 ? (
            <EmptyState title="No touches yet">Log a call, WhatsApp, visit or email.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {touches.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">{TOUCH_KIND_LABELS[t.kind as TouchKind] ?? t.kind}</span>
                      {t.call_status && <span className="text-muted-foreground">· {callStatusLabel(t.call_status)}</span>}
                      <span className="text-muted-foreground">· {formatWhen(t.occurred_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{t.summary || <span className="text-muted-foreground">No notes</span>}</p>
                    <p className="mt-1 text-xs text-muted-foreground">by {t.touching_user_username ?? "unknown"}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Edit touch" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      <TouchDialog
        prospectId={prospectId}
        touch={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setVersion((v) => v + 1);
          onChanged();
        }}
      />
    </Card>
  );
}

const CALL_STATUS_OPTIONS = CALL_STATUSES.map((value) => ({ value, label: callStatusLabel(value) }));

function TouchDialog({ prospectId, touch, onClose, onSaved }: { prospectId: string; touch: Touch | "new" | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = React.useState<TouchKind>("call");
  const [occurredAt, setOccurredAt] = React.useState("");
  const [callStatus, setCallStatus] = React.useState("");
  const [summary, setSummary] = React.useState("");
  React.useEffect(() => {
    if (!touch) return;
    const existing = touch === "new" ? null : touch;
    setKind((existing?.kind as TouchKind) ?? "call");
    setOccurredAt(toLocalInput(existing?.occurred_at ?? new Date().toISOString()));
    setCallStatus(existing?.call_status ?? "");
    setSummary(existing?.summary ?? "");
  }, [touch]);

  const save = useAction(() => {
    const json = { kind, occurred_at: fromLocalInput(occurredAt) ?? new Date().toISOString(), summary: summary || null, call_status: callStatus || null };
    return touch && touch !== "new"
      ? unwrap(crm.prospects[":id"].touches[":touchId"].$patch({ param: { id: prospectId, touchId: touch.id }, json }))
      : unwrap(crm.prospects[":id"].touches.$post({ param: { id: prospectId }, json }));
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!(await save.run())) return;
    toast.success(touch === "new" ? "Touch logged" : "Touch updated");
    onSaved();
  }

  return (
    <Dialog
      open={touch !== null}
      onClose={onClose}
      title={touch === "new" ? "Add touch" : "Edit touch"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="touch-form" pending={save.pending}>
            {touch === "new" ? "Add touch" : "Save touch"}
          </Button>
        </>
      }
    >
      <form id="touch-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Kind" required>
          <Select options={KIND_OPTIONS} value={kind} onChange={(e) => setKind(e.target.value as TouchKind)} />
        </Field>
        <Field label="Occurred at" required>
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </Field>
        <Field label="Outcome">
          <Select options={CALL_STATUS_OPTIONS} placeholder="None" value={callStatus} onChange={(e) => setCallStatus(e.target.value)} />
        </Field>
        <Field label="Summary">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
