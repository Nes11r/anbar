import { NextResponse, type NextRequest } from "next/server";

/** Cheap edge check: no session cookie → login. Real validation happens on the server (DB) for every page/action. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("hec_session");
  if (!hasSession && !pathname.startsWith("/login") && !pathname.startsWith("/register") && !pathname.startsWith("/api/health")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|hecotec-logo.png|robots.txt|manifest.webmanifest|sw.js|offline.html|icons/).*)"],
};
