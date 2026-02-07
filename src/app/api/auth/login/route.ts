import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { constantTimeEquals } from '@/lib/auth/password';
import { getEnv } from '@/lib/env';

export async function POST(request: Request) {
  const form = await request.formData();
  const password = form.get('password');
  if (typeof password !== 'string') {
    return NextResponse.redirect(new URL('/login?error=1', request.url));
  }

  let masterPassword: string;
  try {
    masterPassword = getEnv().MASTER_PASSWORD;
  } catch {
    return NextResponse.redirect(new URL('/login?error=server', request.url));
  }

  const ok = constantTimeEquals(password, masterPassword);
  if (!ok) {
    return NextResponse.redirect(new URL('/login?error=1', request.url));
  }

  const token = await createSessionToken();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.redirect(new URL('/', request.url));
}
