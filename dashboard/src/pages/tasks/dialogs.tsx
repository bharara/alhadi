import React from "react";
import type { Touch } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { CALL_STATUSES, callStatusLabel, PROSPECT_STATUSES, STATUS_LABELS, TOUCH_KIND_LABELS, TOUCH_KINDS, type ProspectStatus, type TouchKind } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/form";
import { Dialog } from "@/ui/layout";
import type { TaskButton, TaskPayload } from "./actions";

const statusOptions = PROSPECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** Notes, status and next touch for an action before it is logged. */
export function ActionDialog({
  button,
  pending,
  onClose,
  onSubmit,
}: {
  button: TaskButton | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskPayload) => void;
}) {
  const [summary, setSummary] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [nextTouch, setNextTouch] = React.useState("");
  React.useEffect(() => {
    if (!button) return;
    setSummary(button.payload.summary ?? "");
    setStatus(button.payload.status ?? "");
    setNextTouch("");
  }, [button]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!button) return;
    const payload: TaskPayload = { kind: button.payload.kind, call_status: button.payload.call_status, summary: summary.trim() || undefined };
    if (status) payload.status = status as ProspectStatus;
    const next = fromLocalInput(nextTouch);
    if (next) payload.next_touch_at = next;
    else if (button.payload.clear_next_touch) payload.clear_next_touch = true;
    onSubmit(payload);
  }

  return (
    <Dialog
      open={Boolean(button)}
      onClose={onClose}
      title={button ? `${TOUCH_KIND_LABELS[button.payload.kind]} · ${button.label}` : ""}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-action-form" pending={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="task-action-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Notes">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus />
        </Field>
        <Field label="Status" hint="Leave as is to keep the prospect's status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} placeholder="Keep current status" />
        </Field>
        <Field label="Next touch" hint="When to follow up; leave empty for no reminder">
          <Input type="datetime-local" value={nextTouch} onChange={(e) => setNextTouch(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

export type TouchChanges = { kind: TouchKind; occurred_at: string; call_status: string | null; summary: string | null };

export function EditTouchDialog({
  touch,
  pending,
  onClose,
  onSubmit,
}: {
  touch: Touch | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (changes: TouchChanges) => void;
}) {
  const [kind, setKind] = React.useState<TouchKind>("call");
  const [occurredAt, setOccurredAt] = React.useState("");
  const [callStatus, setCallStatus] = React.useState("");
  const [summary, setSummary] = React.useState("");
  React.useEffect(() => {
    if (!touch) return;
    setKind(touch.kind as TouchKind);
    setOccurredAt(toLocalInput(touch.occurred_at));
    setCallStatus(touch.call_status ?? "");
    setSummary(touch.summary ?? "");
  }, [touch]);

  const callOptions: { value: string; label: string }[] = CALL_STATUSES.map((s) => ({ value: s, label: callStatusLabel(s) }));
  if (callStatus && !(CALL_STATUSES as readonly string[]).includes(callStatus)) callOptions.push({ value: callStatus, label: callStatusLabel(callStatus) });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const occurred = fromLocalInput(occurredAt);
    if (!occurred) return;
    onSubmit({ kind, occurred_at: occurred, call_status: callStatus || null, summary: summary.trim() || null });
  }

  return (
    <Dialog
      open={Boolean(touch)}
      onClose={onClose}
      title="Edit touch"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-touch-form" pending={pending}>
            Save touch
          </Button>
        </>
      }
    >
      <form id="edit-touch-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kind" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value as TouchKind)} options={TOUCH_KINDS.map((k) => ({ value: k, label: TOUCH_KIND_LABELS[k] }))} />
          </Field>
          <Field label="Occurred at" required>
            <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
          </Field>
        </div>
        <Field label="Status">
          <Select value={callStatus} onChange={(e) => setCallStatus(e.target.value)} options={callOptions} placeholder="No status" />
        </Field>
        <Field label="Notes">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
