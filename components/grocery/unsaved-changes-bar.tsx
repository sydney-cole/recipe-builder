"use client";

import { AlertCircle } from "lucide-react";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

const PHONE_QUERY = "(max-width: 767px)";

function subscribePhone(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/** Whether the screen is phone-sized, where the app has its fixed bottom navigation. */
export function useIsPhone() {
  return useSyncExternalStore(
    subscribePhone,
    () => typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/** "You have unsaved changes." in the danger colour, with an icon so it is not told by colour alone. */
export function UnsavedNotice({ className = "", ...props }: { className?: string; role?: "status" }) {
  return (
    <p className={`grocery-unsaved ${className}`} {...props}>
      <AlertCircle size={18} aria-hidden="true" />
      You have unsaved changes.
    </p>
  );
}

/**
 * Keeps `--grocery-bar-bottom` on the bar at the bottom navigation's real
 * height, which includes the safe-area inset, so the bar sits just above it.
 * The stylesheet's fallback is used until it is measured.
 */
function useAboveNavigation() {
  return useCallback((bar: HTMLDivElement | null) => {
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    if (!bar || !nav) return;
    const update = () => bar.style.setProperty("--grocery-bar-bottom", `${nav.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
}

/**
 * A bar pinned above the phone's bottom navigation while a list has unsaved
 * changes, so saving never needs a scroll to the summary below the items.
 * The summary panel's notice is the live status; this one is not announced again.
 */
export function UnsavedChangesBar({ children }: { children: ReactNode }) {
  const aboveNavigation = useAboveNavigation();
  return (
    <div ref={aboveNavigation} className="grocery-unsaved-bar" role="region" aria-label="Unsaved changes">
      <UnsavedNotice />
      {children}
    </div>
  );
}
