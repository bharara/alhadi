import React from "react";
import { Link, useBlocker } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { crm, fetchUsers, unwrap, type Prospect, type Touch } from "@/lib/api";
import { formatWhen, fromLocalInput, toLocalInput } from "@/lib/format";
import { QueryView, Spinner, useAction, useQuery, useSearchState } from "@/lib/hooks";
import type { ProspectStatus, TouchKind } from "@worker/prospects/fields";
import { callStatusLabel, STATUS_LABELS, STATUS_OPTIONS, STATUS_TONES, TOUCH_KIND_LABELS } from "@/lib/labels";
import { TouchDialog } from "@/touches/TouchDialog";
import { useSession } from "@/session";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Field, Input, Select, TagsInput, Textarea } from "@/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/ui/layout";
import { CALL_BACK, CALL_BUTTONS, WHATSAPP_BUTTONS, type TaskButton, type TaskPayload } from "./actions";
import { ActionDialog } from "./dialogs";

const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving?";

export function TasksPage() {
  const { user } = useSession();
  const users = useQuery(fetchUsers);
  const [params, setParams] = useSearchState<"user">();
  const [index, setIndex] = React.useState(0);
  const [version, setVersion] = React.useState(0);
  const dirty = React.useRef(false);
  const setDirty = React.useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const userList = users.status === "ready" ? users.data : [];
  const userId = params.user && userList.some((u) => u.id === params.user) ? params.user : (userList.find((u) => u.id === user.id) ?? userList[0])?.id;

  const tasks = useQuery(
    () => (userId ? unwrap(crm.prospects.tasks.search.$post({ json: { assigned_user_id: userId, limit: 100 } })) : Promise.resolve(null)),
    [userId, version],
  );
  const tags = useQuery(() => unwrap(crm.prospects.tags.$get()));

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // In-app navigation away from Tasks (sidebar, back button) asks too.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty.current && currentLocation.pathname !== nextLocation.pathname);
  React.useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(LEAVE_MESSAGE)) {
      dirty.current = false;
      blocker.proceed();
    } else blocker.reset();
  }, [blocker]);

  /** Runs `go` unless there are unsaved notes the user wants to keep. */
  const guard = (go: () => void) => {
    if (dirty.current && !window.confirm(LEAVE_MESSAGE)) return;
    dirty.current = false;
    go();
  };

  const prospects = tasks.status === "ready" ? (tasks.data?.prospects ?? []) : [];
  const position = Math.min(index, Math.max(0, prospects.length - 1));
  const current = prospects[position];

  return (
    <>
      <PageHeader
        title="Tasks"
        lede="Work through due follow-ups first, then general assigned leads."
        actions={
          <Select
            aria-label="Salesperson"
            className="w-56"
            value={userId ?? ""}
            disabled={!userList.length}
            onChange={(e) =>
              guard(() => {
                setParams({ user: e.target.value });
                setIndex(0);
              })
            }
            options={userList.map((u) => ({ value: u.id, label: u.username }))}
          />
        }
      />
      {users.status === "loading" ? (
        <Spinner />
      ) : (
        <QueryView query={tasks}>
          {(data) =>
            !data || !current ? (
              <EmptyState title="Nothing to follow up">No due or unscheduled prospects are assigned to this person. Cold, warm and interested leads land here when they're due.</EmptyState>
            ) : (
              <TaskCard
                key={`${current.id}:${current.updated_at ?? ""}`}
                prospect={current}
                position={position}
                total={data.total}
                count={prospects.length}
                tagSuggestions={tags.status === "ready" ? tags.data.tags : []}
                refreshing={tasks.status === "ready" && tasks.refreshing}
                onDirtyChange={setDirty}
                guard={guard}
                onMove={(step) => guard(() => setIndex(Math.min(Math.max(0, position + step), prospects.length - 1)))}
                onSaved={(saved) => tasks.setData((d) => d && { ...d, prospects: d.prospects.map((p) => (p.id === saved.id ? saved : p)) })}
                onActed={() => {
                  dirty.current = false;
                  setVersion((v) => v + 1);
                }}
              />
            )
          }
        </QueryView>
      )}
    </>
  );
}

function TaskCard({
  prospect,
  position,
  total,
  count,
  tagSuggestions,
  refreshing,
  onDirtyChange,
  guard,
  onMove,
  onSaved,
  onActed,
}: {
  prospect: Prospect;
  position: number;
  total: number;
  count: number;
  tagSuggestions: string[];
  refreshing: boolean;
  onDirtyChange: (dirty: boolean) => void;
  guard: (go: () => void) => void;
  onMove: (step: number) => void;
  onSaved: (prospect: Prospect) => void;
  onActed: () => void;
}) {
  const [touchVersion, setTouchVersion] = React.useState(0);
  const touches = useQuery(() => unwrap(crm.prospects[":id"].touches.$get({ param: { id: prospect.id } })), [prospect.id, touchVersion]);
  const title = prospect.name || prospect.company || prospect.phone;
  const contact = [prospect.phone, prospect.email, prospect.company, prospect.title].filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-4", refreshing && "opacity-60 transition-opacity")}>
      <Card bodyClassName="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[prospect.status]}>{STATUS_LABELS[prospect.status]}</Badge>
            {prospect.next_touch_at ? <Badge tone="purple">Due {formatWhen(prospect.next_touch_at)}</Badge> : <Badge>General</Badge>}
            <span className="text-xs text-muted-foreground tabular-nums">
              {position + 1} of {total > count ? `${count} (${total} due)` : count}
            </span>
          </div>
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {contact.map((item, i) =>
              i === 0 ? (
                <a key={item} href={`tel:${item}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {item}
                </a>
              ) : (
                <span key={item}>{item}</span>
              ),
            )}
          </p>
          {prospect.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {prospect.tags.map((tag) => (
                <Badge key={tag} tone="gold">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Previous prospect" disabled={position === 0} onClick={() => onMove(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Next prospect" disabled={position >= count - 1} onClick={() => onMove(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <OpenProspectLink id={prospect.id} guard={guard} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="order-2 lg:order-1">
          <NotesPanel prospect={prospect} tagSuggestions={tagSuggestions} onDirtyChange={onDirtyChange} onSaved={onSaved} />
        </div>
        <div className="order-3 lg:order-2">
          <PreviousTouches prospectId={prospect.id} touches={touches} onEdited={() => setTouchVersion((v) => v + 1)} />
        </div>
        <div className="order-1 lg:order-3">
          <ActionsPanel prospect={prospect} guard={guard} onActed={onActed} />
        </div>
      </div>
    </div>
  );
}

function OpenProspectLink({ id, guard }: { id: string; guard: (go: () => void) => void }) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const confirmed = React.useRef(false);
  return (
    <Link
      ref={ref}
      to={`/prospects/${id}`}
      onClick={(event) => {
        if (confirmed.current) return;
        event.preventDefault();
        guard(() => {
          confirmed.current = true;
          ref.current?.click();
        });
      }}
      className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm hover:bg-muted"
    >
      <ExternalLink className="h-4 w-4" /> Open prospect
    </Link>
  );
}

type NotesForm = { next_touch_at: string; status: ProspectStatus; tags: string[]; notes: string };

const formOf = (p: Prospect): NotesForm => ({ next_touch_at: toLocalInput(p.next_touch_at), status: p.status, tags: p.tags, notes: p.notes ?? "" });

function NotesPanel({
  prospect,
  tagSuggestions,
  onDirtyChange,
  onSaved,
}: {
  prospect: Prospect;
  tagSuggestions: string[];
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (prospect: Prospect) => void;
}) {
  const initial = React.useMemo(() => formOf(prospect), [prospect]);
  const [form, setForm] = React.useState(initial);
  const changes: Partial<{ next_touch_at: string | null; status: ProspectStatus; tags: string[]; notes: string | null }> = {};
  if (form.next_touch_at !== initial.next_touch_at) changes.next_touch_at = fromLocalInput(form.next_touch_at);
  if (form.status !== initial.status) changes.status = form.status;
  if (JSON.stringify(form.tags) !== JSON.stringify(initial.tags)) changes.tags = form.tags;
  if (form.notes !== initial.notes) changes.notes = form.notes.trim() || null;
  const dirty = Object.keys(changes).length > 0;

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  React.useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = useAction(async () => {
    const saved = await unwrap(crm.prospects[":id"].$patch({ param: { id: prospect.id }, json: changes }));
    onDirtyChange(false);
    toast.success("Saved");
    onSaved(saved);
  });

  const set = <K extends keyof NotesForm>(key: K, value: NotesForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Card
      title="Notes"
      actions={
        <Button size="sm" disabled={!dirty} pending={save.pending} onClick={() => void save.run()}>
          Save
        </Button>
      }
      bodyClassName="flex flex-col gap-4"
    >
      <Field label="Next touch" hint={form.next_touch_at ? undefined : "No follow-up scheduled"}>
        <div className="flex gap-2">
          <Input type="datetime-local" value={form.next_touch_at} onChange={(e) => set("next_touch_at", e.target.value)} />
          {form.next_touch_at && (
            <Button variant="outline" onClick={() => set("next_touch_at", "")}>
              Clear
            </Button>
          )}
        </div>
      </Field>
      <Field label="Status">
        <Select value={form.status} onChange={(e) => set("status", e.target.value as ProspectStatus)} options={STATUS_OPTIONS} />
      </Field>
      <Field label="Tags">
        <TagsInput value={form.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} />
      </Field>
      <Field label="Notes">
        <Textarea rows={8} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      {dirty && <p className="text-xs text-warning">Unsaved changes</p>}
    </Card>
  );
}

function PreviousTouches({ prospectId, touches, onEdited }: { prospectId: string; touches: ReturnType<typeof useQuery<{ touches: Touch[] }>>; onEdited: () => void }) {
  const [editing, setEditing] = React.useState<Touch | null>(null);

  return (
    <Card title="Previous touches" bodyClassName="flex flex-col gap-3">
      <QueryView query={touches}>
        {({ touches: list }) =>
          list.length ? (
            <ul className="flex flex-col gap-2">
              {list.slice(0, 8).map((touch) => (
                <li key={touch.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{TOUCH_KIND_LABELS[touch.kind as TouchKind] ?? touch.kind}</Badge>
                      {touch.call_status && <span className="text-xs font-medium">{callStatusLabel(touch.call_status)}</span>}
                    </div>
                    <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-9 w-9" aria-label="Edit touch" onClick={() => setEditing(touch)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatWhen(touch.occurred_at)}
                    {touch.touching_user_username && ` · ${touch.touching_user_username}`}
                  </p>
                  <p className={cn("mt-1.5 whitespace-pre-line text-sm", !touch.summary && "text-muted-foreground")}>{touch.summary || "No notes"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No touches yet.</p>
          )
        }
      </QueryView>
      <TouchDialog
        prospectId={prospectId}
        touch={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onEdited();
        }}
      />
    </Card>
  );
}

function ActionsPanel({ prospect, guard, onActed }: { prospect: Prospect; guard: (go: () => void) => void; onActed: () => void }) {
  const [tab, setTab] = React.useState<"call" | "whatsapp">("call");
  const [callBack, setCallBack] = React.useState("");
  const [modal, setModal] = React.useState<TaskButton | null>(null);

  const act = useAction(async (payload: TaskPayload) => {
    await unwrap(crm.prospects[":id"]["task-action"].$post({ param: { id: prospect.id }, json: payload }));
    toast.success(`${TOUCH_KIND_LABELS[payload.kind ?? "call"]} logged`);
    setModal(null);
    onActed();
  });

  const press = (button: TaskButton) => guard(() => (button.modal ? setModal(button) : void act.run(button.payload)));

  const scheduleCallBack = () => {
    const at = fromLocalInput(callBack);
    if (!at) return toast.warning("Choose a callback time");
    guard(() => void act.run({ ...CALL_BACK, next_touch_at: at }));
  };

  const buttons = tab === "call" ? CALL_BUTTONS : WHATSAPP_BUTTONS;
  return (
    <Card title="Log an action" bodyClassName="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist">
        {(["call", "whatsapp"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn("min-h-10 rounded text-sm font-medium", tab === value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {value === "call" ? "Call" : "WhatsApp"}
          </button>
        ))}
      </div>

      {tab === "call" && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <span className="text-xs font-medium">Call back</span>
          <Input type="datetime-local" aria-label="Callback time" value={callBack} onChange={(e) => setCallBack(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={act.pending} onClick={scheduleCallBack}>
            Call back
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {buttons.map((button) => (
          <Button key={button.label} variant={button.variant ?? "outline"} className="h-11" disabled={act.pending} onClick={() => press(button)}>
            {button.label}
            {button.modal && "…"}
          </Button>
        ))}
      </div>

      <ActionDialog button={modal} pending={act.pending} onClose={() => setModal(null)} onSubmit={(payload) => void act.run(payload)} />
    </Card>
  );
}
