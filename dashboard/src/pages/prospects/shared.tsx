import { crm, unwrap, type CrmUser, type Prospect } from "@/lib/api";
import { formatWhen, titleFromKey, truncate } from "@/lib/format";
import type { ProspectStatus, TouchKind } from "@worker/prospects/fields";
import { STATUS_LABELS, STATUS_TONES, TOUCH_KIND_LABELS } from "@/lib/labels";
import { Badge } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";

export type ProspectSearchBody = Parameters<typeof crm.prospects.search.$post>[0]["json"];

// The Worker accepts at most this many ids per bulk request.
export const BULK_LIMIT = 5000;

export const chunk = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export const loadTags = () => unwrap(crm.prospects.tags.$get()).then((r) => r.tags);
export const loadExtraFields = () => unwrap(crm.prospects["extra-fields"].$get()).then((r) => r.fields);

export const userOptions = (users: CrmUser[]) => users.map((u) => ({ value: u.id, label: u.username }));

export function StatusBadge({ status }: { status: ProspectStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** All prospect ids matching a search, paged at 500. */
export async function allMatchingIds(body: ProspectSearchBody): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await unwrap(crm.prospects.search.$post({ json: { ...body, limit: 500, offset } }));
    ids.push(...page.prospects.map((p) => p.id));
    if (ids.length >= page.total || page.prospects.length === 0) return ids;
  }
}

function Cell({ value, max = 100 }: { value: string | null | undefined; max?: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span title={value.length > max ? value : undefined}>{truncate(value, max)}</span>;
}

const extraText = (value: unknown) => (value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value));

export function ProspectTable({
  prospects,
  onOpen,
  selected,
  onToggle,
  onTogglePage,
}: {
  prospects: Prospect[];
  onOpen: (prospect: Prospect) => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onTogglePage?: (checked: boolean) => void;
}) {
  const extraKeys = [...new Set(prospects.flatMap((p) => Object.keys(p.extra)))].sort();
  const allChecked = Boolean(selected && prospects.length && prospects.every((p) => selected.has(p.id)));
  return (
    <Table>
      <thead>
        <tr>
          {selected && (
            <Th className="w-10">
              <input
                type="checkbox"
                aria-label="Select this page"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={allChecked}
                onChange={(e) => onTogglePage?.(e.target.checked)}
              />
            </Th>
          )}
          <Th>Name</Th>
          <Th>Phone</Th>
          <Th>Email</Th>
          <Th>Status</Th>
          <Th>Assigned</Th>
          <Th>Tags</Th>
          <Th>Company</Th>
          <Th>Title</Th>
          <Th>Last touched</Th>
          <Th>Last kind</Th>
          <Th>Last summary</Th>
          <Th>Created</Th>
          <Th>Updated</Th>
          {extraKeys.map((key) => (
            <Th key={key}>{titleFromKey(key)}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {prospects.map((p) => (
          <Tr key={p.id} onClick={() => onOpen(p)} selected={selected?.has(p.id)}>
            {selected && (
              <Td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name ?? p.phone}`}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={selected.has(p.id)}
                  onChange={() => onToggle?.(p.id)}
                />
              </Td>
            )}
            <Td className="min-w-[10rem] font-medium">
              <Cell value={p.name} />
            </Td>
            <Td className="whitespace-nowrap tabular-nums">{p.phone}</Td>
            <Td className="min-w-[12rem]">
              <Cell value={p.email} />
            </Td>
            <Td>
              <StatusBadge status={p.status} />
            </Td>
            <Td className="whitespace-nowrap">
              <Cell value={p.assigned_user_username} />
            </Td>
            <Td className="min-w-[10rem]">
              <div className="flex flex-wrap gap-1">
                {p.tags.length ? p.tags.map((t) => <Badge key={t} tone="gold">{t}</Badge>) : <span className="text-muted-foreground">—</span>}
              </div>
            </Td>
            <Td className="min-w-[10rem]">
              <Cell value={p.company} />
            </Td>
            <Td className="min-w-[10rem]">
              <Cell value={p.title} />
            </Td>
            <Td className="whitespace-nowrap">{formatWhen(p.last_touched_at)}</Td>
            <Td>{p.last_touch_kind ? TOUCH_KIND_LABELS[p.last_touch_kind as TouchKind] ?? p.last_touch_kind : "—"}</Td>
            <Td className="min-w-[14rem]">
              <Cell value={p.last_touch_summary} />
            </Td>
            <Td className="whitespace-nowrap">{formatWhen(p.created_at)}</Td>
            <Td className="whitespace-nowrap">{formatWhen(p.updated_at)}</Td>
            {extraKeys.map((key) => (
              <Td key={key} className="min-w-[10rem]">
                <Cell value={extraText(p.extra[key])} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
