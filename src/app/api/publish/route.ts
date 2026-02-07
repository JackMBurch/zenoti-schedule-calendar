import { NextResponse } from 'next/server';

import {
  publishRequestSchema,
  publishConflictResponseSchema,
  publishOkResponseSchema,
} from '@/lib/publish/types';
import { scheduleEventSchema, type ScheduleEvent } from '@/lib/schedule/types';
import { scheduleStore } from '@/lib/schedule/store-file';

export const runtime = 'nodejs';

function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function isValidRange(start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return false;
  return e > s;
}

function groupByDate<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const existing = map.get(item.date);
    if (existing) existing.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsedReq = publishRequestSchema.safeParse(body);
  if (!parsedReq.success) {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const { shifts, decisions } = parsedReq.data;
  const nowIso = new Date().toISOString();

  const proposedEvents: ScheduleEvent[] = [];
  for (const shift of shifts) {
    if (!isValidRange(shift.startTime, shift.endTime)) {
      return NextResponse.json(
        {
          error: `Invalid time range for ${shift.date}: ${shift.startTime}–${shift.endTime}`,
        },
        { status: 400 },
      );
    }

    const candidate: ScheduleEvent = {
      id: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      timezone: shift.timezone,
      source: shift.source,
      updatedAt: nowIso,
    };

    const validated = scheduleEventSchema.safeParse(candidate);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid shift data.' },
        { status: 400 },
      );
    }
    proposedEvents.push(validated.data);
  }

  const existingEvents = await scheduleStore.listEvents();
  const existingByDate = groupByDate(existingEvents);
  const proposedByDate = groupByDate(proposedEvents);

  const decisionByDate = new Map<string, 'replace' | 'keep' | 'add'>(
    (decisions ?? []).map((d) => [d.date, d.resolution]),
  );

  const conflicts: Array<{
    date: string;
    existing: ScheduleEvent[];
    proposed: ScheduleEvent[];
  }> = [];

  // compute conflicts for any date with existing events (except exact match duplicates)
  for (const [date, proposed] of proposedByDate.entries()) {
    const existing = existingByDate.get(date) ?? [];
    if (existing.length === 0) continue;

    const proposedUnique = proposed.filter(
      (p) =>
        !existing.some(
          (e) => e.startTime === p.startTime && e.endTime === p.endTime,
        ),
    );

    if (proposedUnique.length > 0) {
      conflicts.push({ date, existing, proposed: proposedUnique });
    }
  }

  // if there are conflicts without decisions, require user choice
  const unresolved = conflicts.filter((c) => !decisionByDate.has(c.date));
  if (unresolved.length > 0) {
    const response = { error: 'conflicts' as const, conflicts: unresolved };
    const parsed = publishConflictResponseSchema.safeParse(response);
    return NextResponse.json(parsed.success ? parsed.data : response, {
      status: 409,
    });
  }

  // build final events list by applying decisions
  let nextEvents = [...existingEvents];
  for (const [date, proposed] of proposedByDate.entries()) {
    const existing = existingByDate.get(date) ?? [];
    const proposedUnique = proposed.filter(
      (p) =>
        !existing.some(
          (e) => e.startTime === p.startTime && e.endTime === p.endTime,
        ),
    );
    if (proposedUnique.length === 0) continue;

    const resolution = decisionByDate.get(date);
    if (!resolution || existing.length === 0) {
      nextEvents.push(...proposedUnique);
      continue;
    }

    if (resolution === 'keep') {
      continue;
    }

    if (resolution === 'replace') {
      nextEvents = nextEvents.filter((e) => e.date !== date);
      nextEvents.push(...proposedUnique);
      continue;
    }

    // add
    nextEvents.push(...proposedUnique);
  }

  await scheduleStore.setEvents(nextEvents);

  const okResponse = { ok: true as const, events: nextEvents };
  const parsedOk = publishOkResponseSchema.safeParse(okResponse);
  if (!parsedOk.success) {
    return NextResponse.json(
      { error: 'Internal response validation failed.' },
      { status: 500 },
    );
  }

  return NextResponse.json(parsedOk.data);
}
