"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { BookOpen, Compass, Home, Inbox, ListChecks, LogOut, MoreHorizontal, Settings } from "lucide-react";
import { Brand } from "@/components/brand";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RecipeImportNotifications } from "@/components/recipes/recipe-import-notifications";

const primary = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/recipe-book", label: "Recipe Book", icon: BookOpen },
  { href: "/app/grocery-lists", label: "Grocery", icon: ListChecks },
  { href: "/app/imports", label: "Recipe Inbox", icon: Inbox },
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
  const [signOutError, setSignOutError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleSignOut() {
    setSignOutError(false);
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setSignOutError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Main navigation">
        <Brand />
        <nav className="nav-list">{primary.map((item) => <NavItem key={item.href} item={item} />)}</nav>
        <div className="sidebar-bottom nav-list">
          <button
            type="button"
            className="nav-link w-full border-0 bg-transparent text-left"
            disabled={isSigningOut}
            onClick={handleSignOut}
            title="Log out"
          >
            <LogOut size={20} strokeWidth={1.9} />
            <span className="nav-label">{isSigningOut ? "Logging out…" : "Log out"}</span>
          </button>
          {signOutError && <p className="px-3 text-xs font-bold text-red-700" role="alert">Couldn&apos;t sign out. Try again.</p>}
          <Link className="nav-link" href="/app/settings" aria-label="Settings"><Settings size={20} /><span className="nav-label">Settings</span></Link>
        </div>
      </aside>

      <div className="app-frame">
        <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primary.slice(0, 4).map((item) => <NavItem key={item.href} item={item} mobile />)}
        <button type="button" className="nav-link" aria-label="More navigation" onClick={() => setMobileMenuOpen(true)}>
          <MoreHorizontal size={20} strokeWidth={1.9} />
          <span className="nav-label">More</span>
        </button>
      </nav>
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent>
          <DialogTitle>More</DialogTitle>
          <DialogDescription>Open your Recipe Inbox, account settings, or sign out.</DialogDescription>
          <nav className="mt-5 grid gap-2" aria-label="More navigation options">
            <Link className="nav-link" href="/app/imports" onClick={() => setMobileMenuOpen(false)}><Inbox size={20} /><span>Recipe Inbox</span></Link>
            <Link className="nav-link" href="/app/settings" onClick={() => setMobileMenuOpen(false)}><Settings size={20} /><span>Settings</span></Link>
            <button type="button" className="nav-link w-full border-0 bg-transparent text-left" disabled={isSigningOut} onClick={() => void handleSignOut()}><LogOut size={20} /><span>{isSigningOut ? "Logging out…" : "Log out"}</span></button>
            {signOutError && <p className="px-3 text-xs font-bold text-red-700" role="alert">Couldn&apos;t sign out. Try again.</p>}
          </nav>
        </DialogContent>
      </Dialog>
      <RecipeImportNotifications />
    </div>
  );
}
