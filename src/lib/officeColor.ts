import type { CSSProperties } from "react";
import type { Office } from "@/lib/types";

/**
 * Pick a foreground colour with adequate contrast against `bg`. Uses the YIQ
 * formula — cheap and good enough for chip-sized text.
 */
export function legibleTextOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#1a2744"; // navy fallback for non-hex inputs
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1a2744" : "#ffffff";
}

/**
 * Inline style for an `.office-badge` based on the office's stored colour.
 * Returns undefined when no colour is set, in which case the existing
 * CSS class rules (or the unstyled default) take over.
 */
export function officeBadgeStyle(
  office: Pick<Office, "color"> | null | undefined,
  extra?: CSSProperties
): CSSProperties | undefined {
  const color = office?.color?.trim();
  if (!color) return extra;
  return { background: color, color: legibleTextOn(color), ...(extra ?? {}) };
}
