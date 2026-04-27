"use client";

import { useEffect, useState } from "react";

/**
 * Tiny shared store for "who is online right now" that the realtime
 * presence subscription writes into and any component can read from.
 *
 * Why this exists: Supabase Realtime returns the SAME channel object for
 * a given topic name within a client. If two components both call
 * supabase.channel("users:online", ...) and one of them subscribes
 * first, the second's .on("presence", ...) call throws because Supabase
 * forbids registering presence callbacks after subscribe(). Routing all
 * presence reads through this store keeps the channel single-owner
 * (PresenceBeacon) and lets the rest of the app subscribe via React
 * state instead of a second Supabase channel.
 */

let onlineIds: Set<string> = new Set();
const listeners = new Set<(s: Set<string>) => void>();

export function setOnlineIds(next: Set<string>) {
  onlineIds = next;
  listeners.forEach((l) => l(next));
}

export function getOnlineIds(): Set<string> {
  return onlineIds;
}

/**
 * Subscribe to live presence updates. Returns the current set of user
 * ids known to be online and re-renders on every change.
 */
export function useOnlineIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(onlineIds);
  useEffect(() => {
    listeners.add(setIds);
    // PresenceBeacon may have updated the store between this component's
    // mount and effect; pick that up so we don't render stale data.
    setIds(onlineIds);
    return () => {
      listeners.delete(setIds);
    };
  }, []);
  return ids;
}
