import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // /welcome is treated as an auth route: invitees land there with their
  // Supabase tokens in the URL hash, which the client picks up. The server
  // can't see those tokens, so without this allowlist the middleware would
  // bounce them to /login and the hash (and the invite session) would be
  // lost in the redirect.
  const isAuthRoute =
    pathname === "/login" || pathname === "/welcome" || pathname.startsWith("/auth");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets");

  if (!user && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Deactivated accounts shouldn't be able to use the portal. Supabase
  // doesn't know about our profiles.is_active flag, so its login keeps
  // accepting the password — we have to enforce it ourselves on every
  // app request. If is_active is false, sign them out (clearing the
  // auth cookies) and bounce to /login with a flag the page reads to
  // explain why.
  if (user && !isAuthRoute && !isPublicAsset) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (prof && prof.is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("inactive", "1");
      const redirect = NextResponse.redirect(url);
      // Carry the cleared auth cookies that signOut wrote onto
      // supabaseResponse over to the redirect, so the browser actually
      // forgets the session.
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/contacts";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
