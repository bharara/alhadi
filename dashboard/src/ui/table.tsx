import React from "react";
import { cn } from "./cn";

/** Scrolls sideways on small screens; the page itself never does. */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const Th = ({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("whitespace-nowrap border-b border-border bg-muted/60 px-3 py-2.5 text-left label-caps", className)} {...props}>
    {children}
  </th>
);

export const Td = ({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b border-border px-3 py-2.5 align-top", className)} {...props}>
    {children}
  </td>
);

export function Tr({ onClick, className, children, selected }: { onClick?: () => void; className?: string; children: React.ReactNode; selected?: boolean }) {
  return (
    <tr
      onClick={onClick}
      className={cn("last:[&>td]:border-b-0", onClick && "cursor-pointer hover:bg-primary-muted/40", selected && "bg-primary-muted/60", className)}
    >
      {children}
    </tr>
  );
}
