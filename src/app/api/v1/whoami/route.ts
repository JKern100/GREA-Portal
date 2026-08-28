import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/import/apiKeys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lets an office confirm a key works before pointing it at real data.
 * Returns no contact or deal data — only which office the key belongs to.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiKey(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.failure.error }, { status: auth.failure.status });
  }
  return NextResponse.json({
    ok: true,
    office: auth.key.officeCode,
    keyLabel: auth.key.label
  });
}
