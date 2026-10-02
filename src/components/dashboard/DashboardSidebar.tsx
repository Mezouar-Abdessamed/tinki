import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Link2,
  LogOut,
  Menu,
  Palette,
  QrCode,
  Settings,
  ShieldCheck,
  UserCircle,
  UserCog,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/lib/i18n";

export const DASHBOARD_NAV = [
  { to: "/dashboard/profile", label: "My Profile", icon: UserCircle },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/dashboard/links", label: "My Links", icon: Link2 },
  { to: "/dashboard/customize-qr-code", label: "Costumize QR Code", icon: QrCode },
  { to: "/dashboard/customize", label: "Customize profile", icon: Palette },
  { to: "/dashboard/informations", label: "My Informations & Security", icon: ShieldCheck },
  { to: "/dashboard/account", label: "Account & Deletion", icon: UserCog },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;


function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = DASHBOARD_NAV;


  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "border border-border bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to="/dashboard"
      onClick={onNavigate}
      className="font-display text-lg font-bold tracking-tight"
    >
      Link<span className="text-primary">Me</span>
    </Link>
  );
}

export function DashboardSidebar({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-border lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:gap-6 lg:overflow-y-auto lg:px-4 lg:py-5">
        <div className="space-y-6">
          <Brand />
          <NavLinks />
        </div>
        <Button variant="ghost" size="sm" className="justify-start" onClick={onLogout}>
          <LogOut className="me-2 h-4 w-4" />
          Log out
        </Button>
      </aside>

      {/* Mobile: top bar with a drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side={lang === "ar" ? "right" : "left"} className="w-72 p-5">
            <SheetTitle className="sr-only">Dashboard menu</SheetTitle>
            <div className="flex h-full flex-col justify-between">
              <div className="space-y-6">
                <Brand onNavigate={() => setOpen(false)} />
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <Button variant="ghost" size="sm" className="justify-start" onClick={onLogout}>
                <LogOut className="me-2 h-4 w-4" />
                Log out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <Brand />
      </header>
    </>
  );
}
