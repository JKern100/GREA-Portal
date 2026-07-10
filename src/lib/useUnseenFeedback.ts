"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LAST_SEEN_KEY = "grea_feedback_last_seen";

/**
 * Count of open feedback items the admin hasn't seen yet — drives the badge
 * on the Feedback nav entry (spec S-8). "Seen" is a per-device localStorage
 * timestamp updated whenever the admin opens the Feedback page.
 *
 * Deliberately no email/notification engine and no DB migration: RLS already
 * scopes an office admin's feedback reads to their own office, so a plain
 * count query from the browser returns the right number for whoever's signed
 * in. Per-device is an accepted limitation (see spec) — good enough until an
 * email/notification engine lands in a later phase.
 */
export function useUnseenFeedback(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Opening the Feedback page marks everything up to now as seen and clears
    // the badge immediately, without waiting for a round-trip.
    if (pathname === "/feedback") {
      try {
        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      } catch {
        // localStorage unavailable (private mode / disabled) — the badge just
        // won't persist "seen" across reloads; not worth failing over.
      }
      setCount(0);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      let since: string | null = null;
      try {
        since = localStorage.getItem(LAST_SEEN_KEY);
      } catch {
        since = null;
      }
      // Only "open" (untriaged) items count as needing review. With no
      // last-seen baseline yet, surface the whole current backlog.
      let q = supabase
        .from("feedback_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (since) q = q.gt("created_at", since);
      const { count: c } = await q;
      if (!cancelled) setCount(c ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return count;
}
