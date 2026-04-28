import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_COLUMNS } from "@/lib/deals/import-schema";
import type { DealRecord } from "@/lib/types";

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

// The export is a SUPERSET of the import template: we add the broker name so
// an admin reviewing an export sees who owns each deal. Re-importing the file
// is still fine — the importer ignores unknown columns with a warning, and the
// broker assignment is rebuilt from broker_email.
const EXTRA_HEADERS = ["Broker Name"];
const EXPORT_HEADERS = (() => {
  const out: string[] = [];
  for (const col of TEMPLATE_COLUMNS) {
    out.push(col.header);
    if (col.key === "broker_email") out.push(...EXTRA_HEADERS);
  }
  return out;
})();

function rowFor(d: DealRecord, brokerEmailById: Map<string, string>): string[] {
  const broker_email = d.assigned_broker_id ? brokerEmailById.get(d.assigned_broker_id) ?? "" : "";
  const bag: Record<string, unknown> = {
    deal_name: d.deal_name,
    property_address: d.property_address,
    property_type: d.property_type,
    deal_value: d.deal_value,
    stage: d.stage,
    broker_email,
    seller_name: d.seller_name,
    buyer_name: d.buyer_name,
    sectors: d.sectors,
    om_link: d.om_link,
    date_added: d.date_added,
    notes: d.notes,
    is_confidential: d.is_confidential
  };
  const out: string[] = [];
  for (const col of TEMPLATE_COLUMNS) {
    out.push(fmt(bag[col.key]));
    if (col.key === "broker_email") {
      out.push(fmt(d.assigned_broker_name));
    }
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "office_admin") {
      return NextResponse.json(
        {
          error:
            "Only office admins can export pipeline. Superadmins must impersonate an office admin to export."
        },
        { status: 403 }
      );
    }
    if (!profile.office_id) {
      return NextResponse.json({ error: "You are not assigned to an office." }, { status: 400 });
    }

    const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

    const supabase = createClient();

    const { data: deals, error } = await supabase
      .from("deals")
      .select("*")
      .eq("office_id", profile.office_id)
      .order("deal_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: `Could not load deals: ${error.message}` }, { status: 500 });
    }

    const brokerIds = Array.from(
      new Set(
        ((deals ?? []) as DealRecord[])
          .map((d) => d.assigned_broker_id)
          .filter((x): x is string => !!x)
      )
    );
    const brokerEmailById = new Map<string, string>();
    if (brokerIds.length > 0) {
      const { data: brokers } = await supabase.from("profiles").select("id, email").in("id", brokerIds);
      for (const b of brokers ?? []) {
        if (b.email) brokerEmailById.set(String(b.id), String(b.email));
      }
    }

    const rows = ((deals ?? []) as DealRecord[]).map((d) => rowFor(d, brokerEmailById));
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const sheet = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Pipeline");
      const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as
        | Buffer
        | Uint8Array
        | number[];
      const body =
        out instanceof Uint8Array ? out : Uint8Array.from(out as number[]);
      return new NextResponse(body as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="grea_pipeline_${stamp}.xlsx"`,
          "Cache-Control": "no-store"
        }
      });
    }

    const csv = [EXPORT_HEADERS, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grea_pipeline_${stamp}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    const e = err as Error;
    console.error("[deals/export] unhandled error:", e?.stack || e);
    return new NextResponse(
      `Export failed: ${e?.message || "unknown error"}\n\n${(e?.stack || "").split("\n").slice(0, 6).join("\n")}`,
      {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }
}
