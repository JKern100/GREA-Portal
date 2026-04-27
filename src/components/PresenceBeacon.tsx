"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOnlineIds } from "@/lib/presence";

/**
 * Single owner of the "users:online" Supabase Realtime channel. Mounted
 * once at the (app) layout so every authenticated tab the user has open
 * contributes a presence event AND keeps the shared online-ids store in
 * sync. Other components (e.g. UsersTable) read presence via the
 * `useOnlineIds` hook in `lib/presence.ts` rather than opening their own
 * subscription, which would conflict with this one.
 */
export default function PresenceBeacon({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel("users:online", {
      config: { presence: { key: userId } }
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.values(state).forEach((arr) => {
          (arr as { user_id?: string }[]).forEach((p) => {
            if (p.user_id) ids.add(p.user_id);
          });
        });
        setOnlineIds(ids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      // Clear the store on unmount so a stale set doesn't outlive the
      // last viewer of this user's session.
      setOnlineIds(new Set());
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
