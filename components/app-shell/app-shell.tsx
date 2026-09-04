"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Bell, BookOpen, Compass, Home, Inbox, ListChecks, LogOut, Search, Settings, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/recipe-book", label: "Recipe Book", icon: BookOpen },
  { href: "/app/subscriptions", label: "Subscriptions", icon: Sparkles },
  { href: "/app/grocery-lists", label: "Grocery", icon: ListChecks },
];

function NavItem({ item, mobile = false }: { item: (typeof primary)[number]; mobile?: boolean }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link className={cn("nav-link", active && "active")} href={item.href} aria-current={active ? "page" : undefined} title={mobile ? undefined : item.label}>
      <Icon size={20} strokeWidth={1.9} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <Brand />
        <nav className="nav-list">{primary.map((item) => <NavItem key={item.href} item={item} />)}</nav>
        <p className="sidebar-caption mt-6 px-3 text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Workspace</p>
        <nav className="nav-list mt-2">
          <Link className="nav-link" href="/app/imports"><Inbox size={20} /><span className="nav-label">Email imports</span></Link>
        </nav>
        <div className="sidebar-bottom nav-list">
          <Link className="nav-link" href="/app/settings"><Settings size={20} /><span className="nav-label">Settings</span></Link>
        </div>
      </aside>

      <div className="app-frame">
        <header className="app-topbar">
          <span className="topbar-brand"><Brand compact /><span>PerfectPlate</span></span>
          <button className="global-search" type="button" aria-label="Search recipes">
            <Search size={17} /><span>Search recipes, ingredients, and lists</span><span className="keycap">⌘ K</span>
          </button>
          <Button asChild variant="accent" className="hidden sm:inline-flex"><Link href="/app/imports"><Inbox size={17} />Email recipe</Link></Button>
          <Button variant="ghost" size="icon" aria-label="Notifications"><Bell size={19} /></Button>
          <Button variant="secondary" size="icon" aria-label="Sign out" title="Sign out" disabled={isSigningOut} onClick={handleSignOut}>
            <LogOut size={18} />
          </Button>
        </header>
        <main id="main-content" className="app-main">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primary.map((item) => <NavItem key={item.href} item={item} mobile />)}
      </nav>
    </div>
  );
}
