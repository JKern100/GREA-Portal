import { IMPERSONATE_COOKIE, getRealProfile } from "@/lib/data";
import { NextResponse } from "next/server";

/**
 * Start impersonating a user. Only superadmins can call this.
 * Body: { userId: string }
 */
export async function POST(request: Request) {
  const real = await getRealProfile();
  if (!real || real.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (userId === real.id) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8 // 8 hours
  });
  return res;
}

/**
 * Stop impersonating. Accessible to anyone — clearing a non-existent cookie
 * is a no-op, and allowing this unconditionally makes the "Stop" button
 * resilient even if the real user session has changed.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return res;
}
