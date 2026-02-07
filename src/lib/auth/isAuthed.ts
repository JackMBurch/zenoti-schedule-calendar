import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function isAuthed(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return false;
    return await verifySessionToken(token);
  } catch {
    return false;
  }
}
