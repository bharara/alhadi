import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Building2, CheckSquare, Globe, LayoutDashboard, LogOut, Menu, MessageSquare, Users, X } from "lucide-react";
import { useSession } from "@/session";
import { cn } from "@/ui/cn";
import logo from "@/logo.png";

const NAV = [
  { group: "CRM", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/prospects", label: "Prospects", icon: Users },
    { to: "/touches", label: "Touches", icon: MessageSquare },
    { to: "/tasks", label: "Tasks", icon: CheckSquare },
    { to: "/inventory", label: "Properties", icon: Building2 },
  ] },
  { group: "Website", items: [
    { to: "/website", label: "Website listings", icon: Globe },
    { to: "/analytics", label: "Search analytics", icon: BarChart3 },
  ] },
] as const;

const ADMIN_NAV = { to: "/users", label: "User management" };

export function Shell() {
  const { user, signOut } = useSession();
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  React.useEffect(() => setOpen(false), [location.pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{section.group}</div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </ul>
        </div>
      ))}
      {user.role === "admin" && (
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Admin</div>
          <ul>
            <NavItem {...ADMIN_NAV} icon={Users} />
          </ul>
        </div>
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="truncate px-3 pb-2 text-xs text-sidebar-foreground/70" title={user.username}>
        {user.username} · {user.role}
      </div>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-white/5">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-3 px-6 py-5">
      <img src={logo} alt="" className="h-8 w-8 rounded object-contain" />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">Best Builders</div>
        <div className="text-xs text-sidebar-foreground/60">Dashboard</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="h-7 w-7 rounded object-contain" />
          <span className="text-sm font-semibold">Best Builders</span>
        </div>
        <button onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-sidebar">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center text-sidebar-foreground" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            isActive ? "bg-primary/15 font-medium text-primary" : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
          )
        }
      >
        <Icon className="h-4 w-4" />
        {label}
      </NavLink>
    </li>
  );
}
