import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateIcs } from '@/lib/ics/generate';
import { scheduleStore } from '@/lib/schedule/store-file';

export const runtime = 'nodejs';

const tokenSchema = z.string().min(1);

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const params = await context.params;
  const token = tokenSchema.safeParse(params.token);
  const expected = tokenSchema.safeParse(process.env.FEED_TOKEN);

  // Return 404 for any unauthorized access (do not leak existence).
  if (!token.success || !expected.success || token.data !== expected.data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const events = await scheduleStore.listEvents();
  const ics = generateIcs({ events, calendarName: 'Zenoti Schedule' });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="zenoti-schedule.ics"',
      'cache-control': 'no-store',
    },
  });
}
