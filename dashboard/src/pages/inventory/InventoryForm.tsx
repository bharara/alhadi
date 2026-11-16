import { Lock } from "lucide-react";
import type { InventoryItem } from "@/lib/api";
import { CONTACT_KINDS, INVENTORY_STATUSES, INVENTORY_TYPE_LABELS, INVENTORY_TYPES } from "@worker/inventory/fields";
import { Field, Input, Select, Textarea } from "@/ui/form";
import { Badge, Card } from "@/ui/layout";

type InventoryType = (typeof INVENTORY_TYPES)[number];

export type InventoryFormState = {
  house_number: string;
  block: string;
  town: string;
  type: InventoryType;
  status: (typeof INVENTORY_STATUSES)[number];
  size: string;
  details: string;
  asking_price: string;
  contact_name: string;
  contact_kind: (typeof CONTACT_KINDS)[number];
  contact_phone_number: string;
};

export const EMPTY_INVENTORY_FORM: InventoryFormState = {
  house_number: "",
  block: "",
  town: "",
  type: "residential_plot",
  status: "available",
  size: "",
  details: "",
  asking_price: "",
  contact_name: "",
  contact_kind: "direct",
  contact_phone_number: "",
};

export function formFromItem(item: InventoryItem): InventoryFormState {
  return {
    house_number: item.house_number,
    block: item.block ?? "",
    town: item.town,
    type: item.type,
    status: item.status,
    size: item.size,
    details: item.details ?? "",
    asking_price: item.asking_price ?? "",
    contact_name: item.contact_name,
    contact_kind: item.contact_kind,
    contact_phone_number: item.contact_phone_number,
  };
}

export function payloadFromForm(form: InventoryFormState) {
  return { ...form, block: form.block || null, details: form.details || null, asking_price: form.asking_price || null };
}

const options = <T extends string>(values: readonly T[], label: (v: T) => string) => values.map((value) => ({ value, label: label(value) }));
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export function InventoryForm({
  form,
  onChange,
  towns,
  disabled,
}: {
  form: InventoryFormState;
  onChange: (form: InventoryFormState) => void;
  towns: string[];
  disabled?: boolean;
}) {
  const set = <K extends keyof InventoryFormState>(key: K, value: InventoryFormState[K]) => onChange({ ...form, [key]: value });
  const townsId = "inventory-towns";

  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <Card title="Property">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="House / plot number" required>
            <Input value={form.house_number} disabled={disabled} onChange={(e) => set("house_number", e.target.value)} required />
          </Field>
          <Field label="Block">
            <Input value={form.block} disabled={disabled} onChange={(e) => set("block", e.target.value)} />
          </Field>
          <Field label="Town" required>
            <Input list={townsId} value={form.town} disabled={disabled} onChange={(e) => set("town", e.target.value)} required />
            <datalist id={townsId}>
              {towns.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Type" required>
            <Select value={form.type} disabled={disabled} options={options(INVENTORY_TYPES, (t) => INVENTORY_TYPE_LABELS[t])} onChange={(e) => set("type", e.target.value as InventoryType)} />
          </Field>
          <Field label="Status" required>
            <Select value={form.status} disabled={disabled} options={options(INVENTORY_STATUSES, capitalize)} onChange={(e) => set("status", e.target.value as InventoryFormState["status"])} />
          </Field>
          <Field label="Size" required>
            <Input placeholder="e.g. 1 Kanal" value={form.size} disabled={disabled} onChange={(e) => set("size", e.target.value)} required />
          </Field>
          <Field label="Asking price" className="sm:col-span-2" hint="Internal. The website listing has its own price text.">
            <Input placeholder="e.g. PKR 2.4 Cr" value={form.asking_price} disabled={disabled} onChange={(e) => set("asking_price", e.target.value)} />
          </Field>
          <Field label="Details" className="sm:col-span-2" hint="Internal notes. Not shown on the website.">
            <Textarea rows={5} value={form.details} disabled={disabled} onChange={(e) => set("details", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            Owner contact{" "}
            <Badge tone="neutral">
              <Lock className="mr-1 h-3 w-3" />
              Private
            </Badge>
          </span>
        }
      >
        <p className="mb-4 text-xs text-muted-foreground">Only the dashboard team sees this. It is never shown on the website.</p>
        <div className="grid gap-4">
          <Field label="Contact name" required>
            <Input value={form.contact_name} disabled={disabled} onChange={(e) => set("contact_name", e.target.value)} required />
          </Field>
          <Field label="Direct / indirect" required>
            <Select value={form.contact_kind} disabled={disabled} options={options(CONTACT_KINDS, capitalize)} onChange={(e) => set("contact_kind", e.target.value as InventoryFormState["contact_kind"])} />
          </Field>
          <Field label="Phone number" required>
            <Input type="tel" value={form.contact_phone_number} disabled={disabled} onChange={(e) => set("contact_phone_number", e.target.value)} required />
          </Field>
        </div>
      </Card>
    </div>
  );
}
