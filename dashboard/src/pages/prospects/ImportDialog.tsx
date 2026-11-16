import React from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { crm, unwrap } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { PROSPECT_STATUSES, STATUS_LABELS, type ProspectStatus } from "@/lib/labels";
import { Button } from "@/ui/button";
import { Field, Input, Select, TagsInput } from "@/ui/form";
import { Badge, Dialog, Pagination } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";

type Target = "ignore" | "phone" | "email" | "name" | "company" | "title" | "tags" | "status" | "notes" | "custom";
type Mapping = { header: string; target: Target; key: string };
type ImportRow = Parameters<typeof crm.prospects.import.$post>[0]["json"]["prospects"][number];
type ImportResult = Awaited<ReturnType<typeof runImport>>;

const STANDARD: Exclude<Target, "ignore" | "custom">[] = ["phone", "email", "name", "company", "title", "tags", "status", "notes"];
const TARGET_OPTIONS = [
  { value: "ignore", label: "Ignore" },
  ...STANDARD.map((t) => ({ value: t, label: t[0]!.toUpperCase() + t.slice(1) })),
  { value: "custom", label: "Custom field" },
];

const SYNONYMS: Record<(typeof STANDARD)[number], string[]> = {
  phone: ["phone", "telephone", "mobile", "tel", "cell", "phone_number"],
  email: ["email", "e_mail", "mail", "email_address", "work_email", "company_email", "primary_email"],
  name: ["name", "full_name", "contact_name", "first_name", "last_name", "firstname", "lastname"],
  company: ["company", "account", "employer"],
  title: ["title", "job_title", "position", "role", "job"],
  tags: ["tag", "tags", "labels", "label"],
  status: ["status", "stage", "state", "lead_status"],
  notes: ["notes", "note", "comments", "comment", "description"],
};

const slug = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const matches = (key: string, synonym: string) => key === synonym || key.endsWith(`_${synonym}`) || key.startsWith(`${synonym}_`);

function detectMappings(headers: string[]): Mapping[] {
  const taken = new Set<string>();
  return headers.map((header) => {
    const key = slug(header);
    const target = STANDARD.find((field) => !taken.has(field) && SYNONYMS[field].some((s) => matches(key, s)));
    if (target) {
      taken.add(target);
      return { header, target, key: "" };
    }
    return { header, target: "custom", key: key || "field" };
  });
}

function normalizeStatus(raw: string): ProspectStatus | null {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const status = value === "donotcontact" ? "do_not_contact" : value;
  return (PROSPECT_STATUSES as readonly string[]).includes(status) ? (status as ProspectStatus) : null;
}

function buildRows(records: Record<string, string>[], mappings: Mapping[], importTag: string[]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const record of records) {
    const row: ImportRow = { phone: null };
    const extra: Record<string, string> = {};
    let tags: string[] = [];
    for (const m of mappings) {
      const value = (record[m.header] ?? "").trim();
      if (!value || m.target === "ignore") continue;
      if (m.target === "custom") extra[m.key.trim()] = value;
      else if (m.target === "tags") tags = value.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
      else if (m.target === "status") row.status = normalizeStatus(value);
      else row[m.target] = value;
    }
    if (!row.phone) continue;
    const seen = new Set<string>();
    row.tags = [...tags, ...importTag].filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
    if (Object.keys(extra).length) row.extra = extra;
    if (!row.status) delete row.status;
    rows.push(row);
  }
  return rows;
}

const runImport = (prospects: ImportRow[]) => unwrap(crm.prospects.import.$post({ json: { prospects } }));

export function ImportDialog({ open, onClose, onImported, tagSuggestions }: { open: boolean; onClose: () => void; onImported: () => void; tagSuggestions: string[] }) {
  const [step, setStep] = React.useState<"upload" | "map" | "done">("upload");
  const [records, setRecords] = React.useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = React.useState<Mapping[]>([]);
  const [importTag, setImportTag] = React.useState<string[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [existingOffset, setExistingOffset] = React.useState(0);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const submit = useAction(runImport);

  React.useEffect(() => {
    if (!open) return;
    setStep("upload");
    setRecords([]);
    setMappings([]);
    setImportTag([]);
    setParseError(null);
    setResult(null);
    setExistingOffset(0);
  }, [open]);

  function readFile(file: File) {
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (parsed) => {
        const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
        const headers = (parsed.meta.fields ?? []).filter(Boolean);
        if (fatal) return setParseError(`Could not read the CSV: ${fatal.message}`);
        if (!headers.length) return setParseError("The CSV has no header row");
        if (!parsed.data.length) return setParseError("The CSV has no rows");
        setRecords(parsed.data);
        setMappings(detectMappings(headers));
        setStep("map");
      },
      error: (error) => setParseError(error.message),
    });
  }

  const setMapping = (index: number, patch: Partial<Mapping>) =>
    setMappings((current) =>
      current.map((m, i) => {
        if (i === index) return { ...m, ...patch, key: patch.target === "custom" && !m.key ? slug(m.header) : (patch.key ?? m.key) };
        // A standard field maps from one column only.
        if (patch.target && patch.target !== "custom" && patch.target !== "ignore" && m.target === patch.target) return { ...m, target: "ignore" };
        return m;
      }),
    );

  const phoneColumns = mappings.filter((m) => m.target === "phone").length;
  const emailColumns = mappings.filter((m) => m.target === "email").length;
  const customKeys = mappings.filter((m) => m.target === "custom").map((m) => m.key.trim());
  const problem =
    phoneColumns !== 1
      ? "Map exactly one column to Phone"
      : emailColumns > 1
        ? "Map at most one column to Email"
        : customKeys.some((k) => !k)
          ? "Every custom field needs a key"
          : new Set(customKeys).size !== customKeys.length
            ? "Custom field keys must be unique"
            : null;
  const rows = React.useMemo(() => (problem ? [] : buildRows(records, mappings, importTag)), [problem, records, mappings, importTag]);

  async function start() {
    const response = await submit.run(rows);
    if (!response) return;
    setResult(response);
    setStep("done");
    const already = new Set(response.existing.map((e) => e.prospect_id)).size;
    toast.success(`Imported: ${response.created} new, ${response.updated} existing updated (${already} already in CRM), ${response.errors.length} row errors`);
    onImported();
  }

  const footer =
    step === "upload" ? (
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
    ) : step === "map" ? (
      <>
        <Button variant="outline" onClick={() => setStep("upload")}>
          Back
        </Button>
        <Button disabled={Boolean(problem) || !rows.length} pending={submit.pending} onClick={start}>
          Import {rows.length} prospect{rows.length === 1 ? "" : "s"}
        </Button>
      </>
    ) : (
      <Button onClick={onClose}>Done</Button>
    );

  return (
    <Dialog open={open} onClose={onClose} title="Import prospects from CSV" width="max-w-4xl" footer={footer}>
      {step === "upload" && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center hover:border-primary"
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="font-medium">Choose a CSV file or drop it here</span>
            <span className="text-xs text-muted-foreground">The first row must be the column headers.</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
              e.target.value = "";
            }}
          />
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        </div>
      )}

      {step === "map" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {records.length} rows · {mappings.length} columns. Rows without a phone are skipped.
          </p>
          <Field label="Apply a tag to all imported leads">
            <TagsInput value={importTag} onChange={setImportTag} suggestions={tagSuggestions} max={1} placeholder="Optional campaign tag" />
          </Field>
          <Table>
            <thead>
              <tr>
                <Th>CSV column</Th>
                <Th>Maps to</Th>
                <Th>Custom field key</Th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, i) => (
                <Tr key={m.header}>
                  <Td className="font-medium">{m.header}</Td>
                  <Td className="min-w-[10rem]">
                    <Select options={TARGET_OPTIONS} value={m.target} onChange={(e) => setMapping(i, { target: e.target.value as Target })} />
                  </Td>
                  <Td className="min-w-[10rem]">
                    {m.target === "custom" && <Input value={m.key} onChange={(e) => setMapping(i, { key: e.target.value })} aria-label={`Custom key for ${m.header}`} />}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          {!problem && rows.length > 0 && (
            <div>
              <div className="label-caps mb-2">Preview</div>
              <Table>
                <thead>
                  <tr>
                    <Th>Phone</Th>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Tags</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((row, i) => (
                    <Tr key={i}>
                      <Td>{row.phone}</Td>
                      <Td>{row.name ?? "—"}</Td>
                      <Td>{row.email ?? "—"}</Td>
                      <Td>{row.tags?.join(", ") || "—"}</Td>
                      <Td>{row.status ? STATUS_LABELS[row.status] : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Created {result.created} · Updated {result.updated} · Row errors {result.errors.length}
          </div>
          {result.errors.length > 0 && (
            <ul className="max-h-32 overflow-y-auto text-sm text-destructive">
              {result.errors.map((e) => (
                <li key={e.index}>
                  Row {e.index + 2}: {e.detail}
                </li>
              ))}
            </ul>
          )}
          {result.existing.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                {result.existing.length} lead{result.existing.length === 1 ? "" : "s"} already existed
              </h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Email</Th>
                    <Th>Matched by</Th>
                    <Th>Status</Th>
                    <Th>Owner</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.existing.slice(existingOffset, existingOffset + 5).map((e) => (
                    <Tr key={`${e.index}-${e.prospect_id}`}>
                      <Td>{e.name ?? "—"}</Td>
                      <Td>{e.phone}</Td>
                      <Td>{e.email ?? "—"}</Td>
                      <Td>
                        <div className="flex gap-1">
                          {e.matched_by.map((m) => (
                            <Badge key={m} tone="info">
                              {m === "email" ? "Email" : "Phone"}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                      <Td>{STATUS_LABELS[e.status as ProspectStatus] ?? e.status}</Td>
                      <Td>{e.assigned_user_username ?? "Unassigned"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <Pagination total={result.existing.length} limit={5} offset={existingOffset} onChange={setExistingOffset} noun="existing leads" />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
