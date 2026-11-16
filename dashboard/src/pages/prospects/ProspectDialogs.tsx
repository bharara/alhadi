import React from "react";
import { toast } from "sonner";
import { crm, unwrap, type CrmUser, type Prospect } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import type { ProspectStatus } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input, Select, TagsInput } from "@/ui/form";
import { Dialog } from "@/ui/layout";
import { STATUS_OPTIONS, userOptions } from "./shared";

const emptyProspect = { phone: "", email: "", name: "", company: "", title: "", assigned_user_id: "", tags: [] as string[], status: "cold" as ProspectStatus };

export function AddProspectDialog({
  open,
  onClose,
  onSaved,
  users,
  tagSuggestions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  users: CrmUser[];
  tagSuggestions: string[];
}) {
  const [form, setForm] = React.useState(emptyProspect);
  React.useEffect(() => {
    if (open) setForm(emptyProspect);
  }, [open]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  // The Worker answers created: true or false; one result type covers both.
  const save = useAction(() =>
    unwrap<{ prospect: Prospect; created: boolean }>(
      crm.prospects.$post({
        json: {
          phone: form.phone,
          email: form.email || null,
          name: form.name || null,
          company: form.company || null,
          title: form.title || null,
          assigned_user_id: form.assigned_user_id || null,
          tags: form.tags,
          status: form.status,
        },
      }) as Promise<never>,
    ),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await save.run();
    if (!result) return;
    if (result.created) toast.success("Prospect created");
    else toast.info(`This lead already existed — updated ${result.prospect.name || result.prospect.phone}`);
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add prospect"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-prospect" pending={save.pending}>
            Add prospect
          </Button>
        </>
      }
    >
      <form id="add-prospect" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" required hint="Separate extra numbers with a comma">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" required autoFocus />
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
        <Field label="Tags" className="sm:col-span-2">
          <TagsInput value={form.tags} onChange={(tags) => set("tags", tags)} suggestions={tagSuggestions} />
        </Field>
      </form>
    </Dialog>
  );
}

export function BulkEditDialog({
  open,
  onClose,
  onSaved,
  ids,
  users,
  tagSuggestions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  ids: string[];
  users: CrmUser[];
  tagSuggestions: string[];
}) {
  const [addTags, setAddTags] = React.useState<string[]>([]);
  const [removeTags, setRemoveTags] = React.useState<string[]>([]);
  const [assigned, setAssigned] = React.useState("");
  const [clearAssigned, setClearAssigned] = React.useState(false);
  const [status, setStatus] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setAddTags([]);
    setRemoveTags([]);
    setAssigned("");
    setClearAssigned(false);
    setStatus("");
  }, [open]);

  const save = useAction(() =>
    unwrap(
      crm.prospects.bulk.$patch({
        json: {
          prospect_ids: ids,
          add_tags: addTags,
          remove_tags: removeTags,
          assigned_user_id: clearAssigned ? null : assigned || null,
          clear_assigned_user: clearAssigned,
          status: (status || null) as ProspectStatus | null,
        },
      }),
    ),
  );

  async function submit() {
    const result = await save.run();
    if (!result) return;
    toast.success(`Updated ${result.updated} prospect${result.updated === 1 ? "" : "s"}`);
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Bulk edit ${ids.length} prospect${ids.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button pending={save.pending} onClick={submit}>
            Apply to {ids.length}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Add tags">
          <TagsInput value={addTags} onChange={setAddTags} suggestions={tagSuggestions} />
        </Field>
        <Field label="Remove tags">
          <TagsInput value={removeTags} onChange={setRemoveTags} suggestions={tagSuggestions} />
        </Field>
        <Field label="Assigned user">
          <Select options={userOptions(users)} placeholder="Leave unchanged" value={assigned} disabled={clearAssigned} onChange={(e) => setAssigned(e.target.value)} />
        </Field>
        <Checkbox label="Clear assigned user" checked={clearAssigned} onChange={setClearAssigned} />
        <Field label="Status">
          <Select options={STATUS_OPTIONS} placeholder="Leave unchanged" value={status} onChange={(e) => setStatus(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
