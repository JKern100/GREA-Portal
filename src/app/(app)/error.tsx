"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the authenticated app shell.
 *
 * The most common cause of "Application error" we hit in practice is a
 * stale chunk: a deploy ships new JS while a tab is still open on the old
 * bundle, then client-side navigation tries to fetch a chunk file that
 * no longer exists. The fix is just to reload — the new bundle is already
 * being served. Detect that case and reload automatically so users don't
 * have to figure out the workaround themselves.
 *
 * For genuine bugs (not chunk errors) we surface a normal fallback with
 * a "Try again" button instead of looping reloads.
 */
export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error.name === "ChunkLoadError" ||
    /Loading chunk \d+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /ChunkLoadError/i.test(error.message);

  useEffect(() => {
    // Always log so diagnosing is possible from the browser console.
    // eslint-disable-next-line no-console
    console.error("AppError boundary caught:", error);
    if (isChunkError && typeof window !== "undefined") {
      // Hard reload — bypasses the stale chunk reference and fetches
      // the current bundle.
      window.location.reload();
    }
  }, [error, isChunkError]);

  if (isChunkError) {
    // Reload is in flight; render nothing rather than flashing a fallback.
    return null;
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "60px auto",
        padding: 24,
        background: "white",
        border: "1px solid var(--gray-200)",
        borderRadius: 12,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        fontSize: 14,
        color: "var(--gray-700)"
      }}
    >
      <h2 style={{ fontSize: 18, color: "var(--navy)", marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ marginBottom: 12 }}>
        The page hit an error and couldn&apos;t finish rendering. Reloading usually clears it.
      </p>
      {error.message && (
        <pre
          style={{
            background: "var(--gray-50)",
            border: "1px solid var(--gray-200)",
            borderRadius: 6,
            padding: 10,
            fontSize: 12,
            color: "var(--gray-700)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            marginBottom: 12
          }}
        >
          {error.message}
        </pre>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <button className="btn-outline" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    </div>
  );
}
