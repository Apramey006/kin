import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Public Atlas sample contains only bundled fictional data.
  if(request.nextUrl.pathname === "/graph" && request.nextUrl.searchParams.get("demo") === "1") return NextResponse.next();
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    const target = new URL("/signin", request.url);
    target.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  if (
    ["/family", "/stage"].some(
      (path) =>
        request.nextUrl.pathname === path ||
        request.nextUrl.pathname.startsWith(path + "/"),
    )
  ) {
    const { data: membership } = await sb
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role === "loved_one" || user.app_metadata.kin_role === "wearer") {
      const redirect = NextResponse.redirect(new URL("/wearer", request.url));
      response.cookies
        .getAll()
        .forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/family/:path*",
    "/stage/:path*",
    "/wearer/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/graph/:path*",
    "/remember/:path*",
  ],
};
