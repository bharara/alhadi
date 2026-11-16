import type { Config } from "tailwindcss";

const color = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        card: color("card"),
        border: color("border"),
        muted: { DEFAULT: color("muted"), foreground: color("muted-foreground") },
        primary: { DEFAULT: color("primary"), foreground: color("primary-foreground"), hover: color("primary-hover"), muted: color("primary-muted") },
        sidebar: { DEFAULT: color("sidebar"), foreground: color("sidebar-foreground") },
        success: color("success"),
        warning: color("warning"),
        destructive: color("destructive"),
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: { sans: ["Inter", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
} satisfies Config;
