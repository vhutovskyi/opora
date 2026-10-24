import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Gate /admin/* and /api/admin/* behind a Supabase Auth session.
// ponytail: single shared admin login, no roles — add roles when there's a second admin.
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";
  // Admin-only APIs: import + R2 media writes. Public APIs (requests/telegram/novaposhta/
  // comments/products) are intentionally NOT matched here.
  const isApi =
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/products/media") ||
    pathname.startsWith("/api/banners/media");

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isLogin) return NextResponse.redirect(new URL("/admin/login", request.url));
  } else if (isLogin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/products/media/:path*", "/api/banners/media/:path*"],
};
