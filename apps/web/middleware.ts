import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ["/usage/:path*", "/sessions/:path*", "/credentials/:path*", "/ask/:path*"],
}
