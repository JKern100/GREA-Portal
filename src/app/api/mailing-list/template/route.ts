import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/data";
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE_ROW
} from "@/lib/mailingList/import-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function buildCsv(): string {
  return [TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW].map((r) => r.map(csvCell).join(",")).join("\n");
}

function buildXlsx(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW]);

  const instructionRows: string[][] = [["Column", "Required", "Notes"]];
  for (const col of TEMPLATE_COLUMNS) {
    instructionRows.push([col.header, col.required ? "Yes" : "No", col.hint]);
  }
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "MailingList");
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as
    | Buffer
    | Uint8Array
    | number[];
  return out instanceof Uint8Array ? out : Uint8Array.from(out as number[]);
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "office_admin" && profile.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "xlsx") {
    const body = buildXlsx();
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="grea_mailing_list_template.xlsx"`,
        "Cache-Control": "no-store"
      }
    });
  }

  return new NextResponse(buildCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grea_mailing_list_template.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
