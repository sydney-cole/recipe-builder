"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/convex/lib/plannerSlots";

/** Today's local date, refreshed every minute and when the page comes back into view. */
export function useToday() {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDateKey(new Date()));
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return today;
}
