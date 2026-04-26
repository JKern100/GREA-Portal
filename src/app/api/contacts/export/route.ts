import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_COLUMNS, TEMPLATE_HEADERS } from "@/lib/contacts/import-schema";
import type { ContactRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/**
 * Build a row of strings in the same order as TEMPLATE_HEADERS, so an exported
 * file can be re-uploaded via the import flow without column re-mapping.
 */
function rowFor(c: ContactRecord, brokerEmailById: Map<string, string>): string[] {
  const broker_email = c.broker_id ? brokerEmailById.get(c.broker_id) ?? "" : "";
  const bag: Record<string, unknown> = {
    contact_name: c.contact_name,
    account_name: c.account_name,
    broker_email,
    contact_phone: c.contact_phone,
    contact_email: c.contact_email,
    relationship_status: c.relationship_status,
    listing: c.listing,
    note: c.note,
    tags: c.tags,
    sectors: c.sectors,
    last_contact_date: c.last_contact_date,
    is_confidential: c.is_confidential
  };
  return TEMPLATE_COLUMNS.map((col) => fmt(bag[col.key]));
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "office_admin") {
      return NextResponse.json(
        {
          error:
            "Only office admins can export contacts. Superadmins must impersonate an office admin to export."
        },
        { status: 403 }
      );
    }
    if (!profile.office_id) {
      return NextResponse.json({ error: "You are not assigned to an office." }, { status: 400 });
    }

    const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

    // Use the user's session-bound client. Reads of the admin's own office
    // contacts and members are already permitted by RLS, so we don't need (and
    // shouldn't depend on) the service-role key for a read-only operation.
    const supabase = createClient();

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("office_id", profile.office_id)
      .order("contact_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: `Could not load contacts: ${error.message}` }, { status: 500 });
    }

    // Resolve broker_id → email so the exported broker_email column round-trips
    // through the importer. If RLS prevents the lookup we just leave the column
    // blank rather than failing the export.
    const brokerIds = Array.from(
      new Set(((contacts ?? []) as ContactRecord[]).map((c) => c.broker_id).filter((x): x is string => !!x))
    );
    const brokerEmailById = new Map<string, string>();
    if (brokerIds.length > 0) {
      const { data: brokers } = await supabase.from("profiles").select("id, email").in("id", brokerIds);
      for (const b of brokers ?? []) {
        if (b.email) brokerEmailById.set(String(b.id), String(b.email));
      }
    }

    const rows = ((contacts ?? []) as ContactRecord[]).map((c) => rowFor(c, brokerEmailById));
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Contacts");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return new NextResponse(ab, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="grea_contacts_${stamp}.xlsx"`,
          "Cache-Control": "no-store"
        }
      });
    }

    const csv = [TEMPLATE_HEADERS, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grea_contacts_${stamp}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    // Unhandled errors here surface as Vercel's generic 500 page, which gives
    // us nothing to debug from. Catch and return the message + a short stack
    // so it's visible in the browser response body.
    const e = err as Error;
    console.error("[contacts/export] unhandled error:", e?.stack || e);
    return new NextResponse(
      `Export failed: ${e?.message || "unknown error"}\n\n${(e?.stack || "").split("\n").slice(0, 6).join("\n")}`,
      {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }
}
