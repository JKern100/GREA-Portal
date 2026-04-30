"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

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

// Detects iOS so callers can switch to iOS-specific app URL schemes
// (e.g. googlegmail:// instead of https://mail.google.com — the latter
// deeplinks to the Gmail app on iOS but the app silently drops the
// ?su=/?body= query params, breaking pre-filled compose).
export function useIsIOS(): boolean {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);
  return isIOS;
}

// Detects Android so callers can use Chrome's intent:// URL scheme to
// invoke specific apps with proper extras (the Gmail Android app
// likewise drops query params from deep-linked https URLs, but it
// honors action.SEND intents with SUBJECT/TEXT string extras).
export function useIsAndroid(): boolean {
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsAndroid(/Android/.test(navigator.userAgent));
  }, []);
  return isAndroid;
}
