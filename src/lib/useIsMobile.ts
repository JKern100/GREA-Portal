"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 640px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  // addEventListener is the modern API; fall back for the rare older browser.
  if (mql.addEventListener) {
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  }
  mql.addListener(callback);
  return () => mql.removeListener(callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// Server-side: assume desktop layout. Mobile devices will get one
// re-render after hydration. The CSS foundation in globals.css already
// clamps padding/widths so this re-render doesn't cause horizontal
// overflow during the brief desktop-layout flash.
function getServerSnapshot() {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
