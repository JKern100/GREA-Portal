"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FeedbackLauncher() {
  const pathname = usePathname();
  if (pathname.startsWith("/feedback") || pathname.startsWith("/login")) return null;

  const params = new URLSearchParams({ submit: "1", context_url: pathname });
  const href = `/feedback?${params.toString()}`;

  return (
    <Link
      href={href}
      title="Submit Feedback"
      style={{
        position: "fixed",
        // Respect iOS home-indicator safe area; falls back to 20px on
        // browsers/OSes without env() support.
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(20px, env(safe-area-inset-bottom))",
        zIndex: 150,
        background: "var(--navy)",
        color: "white",
        padding: "10px 16px",
        borderRadius: 24,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }}
    >
      + Feedback
    </Link>
  );
}
