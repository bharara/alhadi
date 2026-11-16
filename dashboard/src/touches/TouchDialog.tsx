import React from "react";
import { toast } from "sonner";
import type { TouchKind } from "@worker/prospects/fields";
import { crm, unwrap, type Touch } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { CALL_STATUS_OPTIONS, callStatusLabel, TOUCH_KIND_OPTIONS } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/form";
import { Dialog } from "@/ui/layout";

/** Logs a new touch ("new") or edits an existing one; closed when `touch` is null. */
export function TouchDialog({ prospectId, touch, onClose, onSaved }: { prospectId: string; touch: Touch | "new" | null; onClose: () => void; onSaved: () => void }) {
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
    const json = { kind, occurred_at: fromLocalInput(occurredAt) ?? new Date().toISOString(), summary: summary.trim() || null, call_status: callStatus || null };
    return touch && touch !== "new"
      ? unwrap(crm.prospects[":id"].touches[":touchId"].$patch({ param: { id: prospectId, touchId: touch.id }, json }))
      : unwrap(crm.prospects[":id"].touches.$post({ param: { id: prospectId }, json }));
  });

  // Older touches can carry an outcome that isn't in today's list.
  const outcomes = callStatus && !CALL_STATUS_OPTIONS.some((o) => o.value === callStatus) ? [...CALL_STATUS_OPTIONS, { value: callStatus, label: callStatusLabel(callStatus) }] : CALL_STATUS_OPTIONS;

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kind" required>
            <Select options={TOUCH_KIND_OPTIONS} value={kind} onChange={(e) => setKind(e.target.value as TouchKind)} />
          </Field>
          <Field label="Occurred at" required>
            <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
          </Field>
        </div>
        <Field label="Outcome">
          <Select options={outcomes} placeholder="None" value={callStatus} onChange={(e) => setCallStatus(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
