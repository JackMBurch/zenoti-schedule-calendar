import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export const config = {
  matcher: [
    '/upload/:path*',
    '/review/:path*',
    '/schedule/:path*',
    '/calendar/:path*',
    '/api/ocr',
    '/api/publish',
    '/api/drafts/:path*',
    '/api/schedule/:path*',
  ],
};

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const ok = await verifySessionToken(token);
  if (!ok) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}
