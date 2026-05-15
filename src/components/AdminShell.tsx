"use client";

import { useCallback, useEffect, useState } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { useIsMobile } from "@/lib/useIsMobile";

const STORAGE_KEY = "grea.adminSidebar.collapsed";

interface Props {
  mode: "superadmin" | "office_admin";
  children: React.ReactNode;
}

// Client wrapper around the admin-grid layout that owns the
// collapse/expand state for AdminSidebar. Persisting the user's
// choice in localStorage means it survives page navigations within
// the admin area (the layout remounts on every route).
export default function AdminShell({ mode, children }: Props) {
  const isMobile = useIsMobile();
  // Default to expanded so the SSR markup and the first client render
  // match. The effect below corrects to the stored preference on mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage can throw in private modes; treat as expanded.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // On mobile the sidebar collapses to a top tab strip via .admin-grid
  // in globals.css; no width override is needed.
  const style: React.CSSProperties = isMobile
    ? {}
    : { gridTemplateColumns: `${collapsed ? 52 : 200}px minmax(0, 1fr)` };

  return (
    <div className="admin-grid" style={style}>
      <AdminSidebar mode={mode} collapsed={collapsed} onToggleCollapse={toggle} />
      <div>{children}</div>
    </div>
  );
}
