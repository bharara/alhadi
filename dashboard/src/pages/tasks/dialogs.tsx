import React from "react";
import type { ProspectStatus } from "@worker/prospects/fields";
import { fromLocalInput } from "@/lib/format";
import { STATUS_OPTIONS, TOUCH_KIND_LABELS } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/form";
import { Dialog } from "@/ui/layout";
import type { TaskButton, TaskPayload } from "./actions";

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
    else if (button.payload.next_touch_at === null) payload.next_touch_at = null;
    onSubmit(payload);
  }

  return (
    <Dialog
      open={Boolean(button)}
      onClose={onClose}
      title={button ? `${TOUCH_KIND_LABELS[button.payload.kind ?? "call"]} · ${button.label}` : ""}
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
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} placeholder="Keep current status" />
        </Field>
        <Field label="Next touch" hint="When to follow up; leave empty for no reminder">
          <Input type="datetime-local" value={nextTouch} onChange={(e) => setNextTouch(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
