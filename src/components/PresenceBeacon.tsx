"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Tiny client-only component that broadcasts the current user's presence
 * on the shared "users:online" Supabase Realtime channel. Mounted once at
 * the (app) layout so every authenticated tab the user has open contributes
 * a presence event. Other surfaces (e.g. UsersAdmin) subscribe to the same
 * channel to render the online indicator.
 *
 * We pass the user's profile id through the URL-safe presence "key" so the
 * presence state is keyed by user id rather than per-tab anonymous ref —
 * easier to read on the consumer side and dedupes multiple tabs from one
 * user.
 */
export default function PresenceBeacon({ userId }: { userId: string }) {
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel("users:online", {
      config: { presence: { key: userId } }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      }
    });

    // Realtime will untrack on disconnect, but if the tab unmounts (e.g.
    // route change to a non-app surface) clean up explicitly.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
