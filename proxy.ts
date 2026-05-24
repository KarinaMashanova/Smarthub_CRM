import { NextResponse } from 'next/server'

// JWT verification is intentionally NOT done here because Edge Runtime may have
// a different JWT_SECRET than Node.js runtime. Real verification happens in
// getSession() inside layouts and route handlers (Node.js runtime).
export async function proxy() {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
}
