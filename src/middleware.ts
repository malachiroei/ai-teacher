import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Belt-and-suspenders: never run Supabase auth on API (matcher should already exclude).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  try {
    return await updateSession(request);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (/api/*) — critical for chat latency
     * - _next/static, _next/image, favicons, manifests, static assets, models/
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json|manifest.webmanifest|models|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf)$).*)",
  ],
};
