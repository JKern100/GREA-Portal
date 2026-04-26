import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/data";
import {
  TEMPLATE_COLUMNS,
  TEMPLATE_HEADERS,
  TEMPLATE_SAMPLE_ROW
} from "@/lib/contacts/import-schema";

export const dynamic = "force-dynamic";

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function buildCsv(): string {
  const lines: string[] = [];
  lines.push(TEMPLATE_HEADERS.map(csvCell).join(","));
  lines.push(TEMPLATE_SAMPLE_ROW.map(csvCell).join(","));
  return lines.join("\n");
}

function buildXlsx(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW]);

  // Add a second sheet describing each column (admin-friendly reference).
  const instructionRows: string[][] = [["Column", "Required", "Notes"]];
  for (const col of TEMPLATE_COLUMNS) {
    instructionRows.push([col.header, col.required ? "Yes" : "No", col.hint]);
  }
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Contacts");
  XLSX.utils.book_append_sheet(wb, instructions, "Instructions");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "office_admin" && profile.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "xlsx") {
    const buf = buildXlsx();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="grea_contacts_template.xlsx"`,
        "Cache-Control": "no-store"
      }
    });
  }

  const csv = buildCsv();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grea_contacts_template.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
