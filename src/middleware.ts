import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdminLib } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function escapeIlike(s: string) {
  return s.replace(/[\\%_]/g, "\\$&");
}

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

  if (user?.email) {
    const admin = createAdminLib(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { error: linkErr, count: linkedCount } = await admin
      .from("customers")
      .update({ auth_user_id: user.id }, { count: "exact" })
      .ilike("email", escapeIlike(user.email))
      .is("auth_user_id", null);
    if (linkErr) {
      console.error("[middleware] self-heal link failed:", linkErr);
    } else if (linkedCount && linkedCount > 0) {
      console.log(
        `[middleware] self-heal linked customers row to auth user ${user.id} (${user.email})`
      );
    }
  }

  const path = request.nextUrl.pathname;
  const isAuthPage = ["/account/login", "/account/sign-up", "/account/forgot-password", "/account/reset-password"].includes(path);
  const isAccountPage = path.startsWith("/account");
  const isAdminPath = path.startsWith("/admin");
  const isAdminLogin = path === "/admin/login";

  if (isAccountPage && !isAuthPage && !user) {
    if (path === "/account" && request.nextUrl.searchParams.get("purchase") === "success") {
      const target = new URL("/account/sign-up", request.url);
      target.searchParams.set("purchase", "success");
      return NextResponse.redirect(target);
    }
    return NextResponse.redirect(new URL("/account/login", request.url));
  }
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  if (isAdminPath) {
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const userEmail = user?.email?.toLowerCase();
    const isAdmin = !!userEmail && adminEmails.includes(userEmail);

    if (isAdminLogin) {
      if (isAdmin) {
        return NextResponse.redirect(new URL("/admin/customers", request.url));
      }
    } else {
      if (!user) {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
      if (!isAdmin) {
        return NextResponse.redirect(new URL("/account", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/account", "/account/:path*", "/admin", "/admin/:path*"],
};
