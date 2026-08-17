import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

export async function updateSession(request: NextRequest) {
  const passThrough = NextResponse.next({ request });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return passThrough;

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll() {
          try {
            return request.cookies.getAll();
          } catch {
            return [];
          }
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => {
              supabaseResponse.cookies.set(name, value, options);
            });
          } catch {
            /* request may be read-only; keep the existing response */
          }
        },
      },
    });

    try {
      await Promise.race([
        supabase.auth.getUser().catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      return NextResponse.next({ request });
    }

    return supabaseResponse;
  } catch {
    return passThrough;
  }
}
