import { SignJWT, jwtVerify } from 'jose';

import { getEnv } from '@/lib/env';

export const SESSION_COOKIE_NAME = 'zsc_session';

type SessionPayload = {
  role: 'admin';
};

function getSessionKey() {
  const { SESSION_SECRET } = getEnv();
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function createSessionToken(): Promise<string> {
  const key = getSessionKey();
  const payload: SessionPayload = { role: 'admin' };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject('admin')
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const key = getSessionKey();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload.sub === 'admin' && payload.role === 'admin';
  } catch {
    return false;
  }
}
