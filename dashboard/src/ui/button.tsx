import React from "react";
import { cn } from "./cn";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover border-transparent font-semibold",
  outline: "bg-card text-foreground border-border hover:bg-muted",
  ghost: "bg-transparent border-transparent text-foreground hover:bg-muted",
  danger: "bg-destructive text-white border-transparent hover:bg-destructive/90 font-semibold",
  "danger-outline": "bg-card text-destructive border-destructive/40 hover:bg-destructive/5",
} as const;

const SIZES = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", icon: "h-9 w-9 justify-center" } as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  pending?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", pending, disabled, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || pending}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});
