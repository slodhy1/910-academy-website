import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = ["/account/login", "/account/forgot-password", "/account/reset-password"].includes(path);
  const isAccountPage = path.startsWith("/account");

  if (isAccountPage && !isAuthPage && !user) {
    return NextResponse.redirect(new URL("/account/login", request.url));
  }
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/account", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/account/:path*"],
};
