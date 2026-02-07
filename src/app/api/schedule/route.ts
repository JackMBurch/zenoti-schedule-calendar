import { NextResponse } from 'next/server';
import { z } from 'zod';

import { scheduleStore } from '@/lib/schedule/store-file';
import { scheduleEventSchema, type ScheduleEvent } from '@/lib/schedule/types';

export const runtime = 'nodejs';

const putBodySchema = z.object({
  events: z.array(
    scheduleEventSchema.omit({ updatedAt: true, source: true }).extend({
      source: z.string().min(1).optional(),
      updatedAt: z.string().min(1).optional(),
    }),
  ),
});

export async function GET() {
  const events = await scheduleStore.listEvents();
  return NextResponse.json({ events });
}

export async function PUT(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const existing = await scheduleStore.listEvents();
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  const nextEvents: ScheduleEvent[] = parsed.data.events.map((e) => {
    const prev = existingById.get(e.id);
    return {
      id: e.id,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      timezone: e.timezone,
      source: e.source ?? prev?.source ?? 'manual',
      updatedAt: nowIso,
    };
  });

  const validated = z.array(scheduleEventSchema).safeParse(nextEvents);
  if (!validated.success) {
    return NextResponse.json(
      { error: 'One or more events are invalid.' },
      { status: 400 },
    );
  }

  await scheduleStore.setEvents(validated.data);
  return NextResponse.json({ ok: true, events: validated.data });
}
