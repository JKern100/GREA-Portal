import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { escapeFormula } from "@/lib/csvSafety";
import type { FeedbackComment, FeedbackItem, Office, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: string): string {
  return `"${escapeFormula(v).replace(/"/g, '""')}"`;
}

function dateOnly(ts: string | null): string {
  return ts ? ts.slice(0, 10) : "";
}

const HEADERS = [
  "Title",
  "Category",
  "Status",
  "Office",
  "Submitted By",
  "Submitter Email",
  "Assigned To",
  "Created",
  "Resolved",
  "Context URL",
  "Body",
  "Comments"
];

/**
 * Export all feedback tickets (with their comments) as a CSV. Superadmin only —
 * office admins triage in-app but the full cross-office export is a superadmin
 * tool for sharing the whole backlog outward. Reads via the session client, so
 * RLS still applies (a superadmin legitimately sees every ticket + comment).
 */
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "superadmin") {
      return NextResponse.json({ error: "Only superadmins can export feedback." }, { status: 403 });
    }

    const supabase = createClient();

    const [itemsRes, profilesRes, officesRes, commentsRes] = await Promise.all([
      supabase.from("feedback_items").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, email, office_id, role"),
      supabase.from("offices").select("id, code, name"),
      supabase.from("feedback_comments").select("*").order("created_at", { ascending: true })
    ]);

    if (itemsRes.error) {
      return NextResponse.json({ error: `Could not load feedback: ${itemsRes.error.message}` }, { status: 500 });
    }

    const items = (itemsRes.data as FeedbackItem[]) ?? [];
    const profiles = (profilesRes.data as Pick<Profile, "id" | "name" | "email" | "office_id" | "role">[]) ?? [];
    const offices = (officesRes.data as Pick<Office, "id" | "code" | "name">[]) ?? [];
    const comments = (commentsRes.data as FeedbackComment[]) ?? [];

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const officeById = new Map(offices.map((o) => [o.id, o]));

    // Group comments by ticket, formatted "Name (YYYY-MM-DD): body".
    const commentsByItem = new Map<string, string[]>();
    for (const c of comments) {
      const author = c.author_id ? profileById.get(c.author_id) : undefined;
      const who = author?.name || author?.email || "(unknown)";
      const line = `${who} (${dateOnly(c.created_at)}): ${c.body}`;
      const arr = commentsByItem.get(c.item_id) ?? [];
      arr.push(line);
      commentsByItem.set(c.item_id, arr);
    }

    const rows = items.map((it) => {
      const submitter = it.submitted_by ? profileById.get(it.submitted_by) : undefined;
      const submitterOffice = submitter?.office_id ? officeById.get(submitter.office_id) : undefined;
      const assignee = it.assigned_to ? profileById.get(it.assigned_to) : undefined;
      return [
        it.title ?? "",
        it.category ?? "",
        it.status ?? "",
        submitterOffice?.code ?? "",
        submitter?.name ?? "",
        submitter?.email ?? "",
        assignee?.name ?? "unassigned",
        dateOnly(it.created_at),
        dateOnly(it.resolved_at),
        it.context_url ?? "",
        it.body ?? "",
        (commentsByItem.get(it.id) ?? []).join("\n")
      ];
    });

    const csv = [HEADERS, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grea_feedback_${stamp}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    const e = err as Error;
    console.error("[feedback/export] unhandled error:", e?.stack || e);
    return new NextResponse("Export failed. Please try again or contact support.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}
