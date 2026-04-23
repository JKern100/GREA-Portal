"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  impersonatingName: string;
  realName: string;
}

export default function ImpersonationBanner({ impersonatingName, realName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function stop() {
    setLoading(true);
    await fetch("/api/impersonate", { method: "DELETE" });
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <div
      style={{
        background: "#fef3c7",
        borderBottom: "1px solid #fbbf24",
        color: "#92400e",
        padding: "8px 16px",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontWeight: 600
      }}
    >
      <span>
        Viewing as <strong>{impersonatingName}</strong> (signed in as {realName})
      </span>
      <button
        onClick={stop}
        disabled={loading}
        style={{
          background: "#92400e",
          color: "white",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        {loading ? "…" : "Stop impersonating"}
      </button>
    </div>
  );
}
