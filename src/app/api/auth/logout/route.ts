import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { getRequestOrigin } from '@/lib/http/getRequestOrigin';

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL('/', origin));
}
