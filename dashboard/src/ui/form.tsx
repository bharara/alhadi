import React from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

const control =
  "w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, "py-2 leading-relaxed", className)} {...props} />;
});

type Option = { value: string; label: string };

/** Native select; `placeholder` adds an empty first option. */
export function Select({
  options,
  placeholder,
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & { options: readonly Option[]; placeholder?: string }) {
  return (
    <select className={cn(control, "h-10 pr-8", className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={cn("flex items-start gap-2.5 text-sm", disabled && "opacity-60")}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** Free-text tags with suggestions; Enter or comma adds a tag. */
export function TagsInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag",
  disabled,
  max,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  max?: number;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();
  const add = (raw: string) => {
    const tags = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const next = [...value];
    for (const tag of tags) if (!next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    onChange(max ? next.slice(-max) : next);
    setDraft("");
  };
  return (
    <div className={cn(control, "flex min-h-10 flex-wrap items-center gap-1.5 py-1.5", disabled && "bg-muted opacity-70")}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-primary-muted px-2 py-0.5 text-xs font-medium">
          {tag}
          {!disabled && (
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        disabled={disabled}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const next = e.target.value;
          if (next.includes(",") || suggestions.includes(next)) add(next);
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
