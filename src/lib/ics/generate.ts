import { DateTime } from 'luxon';

import type { ScheduleEvent } from '@/lib/schedule/types';

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function foldIcsLine(line: string): string {
  // RFC5545 suggests 75 octets; we approximate by characters.
  const max = 75;
  if (line.length <= max) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + max);
    out.push(i === 0 ? chunk : ` ${chunk}`);
    i += max;
  }
  return out.join('\r\n');
}

function formatUtc(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function sortKey(e: ScheduleEvent): string {
  return `${e.date}T${e.startTime}`;
}

export function generateIcs(params: {
  events: ScheduleEvent[];
  calendarName: string;
  prodId?: string;
}): string {
  const prodId = params.prodId ?? '-//Zenoti Schedule Calendar//EN';
  const now = DateTime.utc();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeIcsText(prodId)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(params.calendarName)}`,
  ];

  const sorted = [...params.events].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );

  for (const ev of sorted) {
    const startLocal = DateTime.fromISO(`${ev.date}T${ev.startTime}`, {
      zone: ev.timezone,
    });
    const endLocal = DateTime.fromISO(`${ev.date}T${ev.endTime}`, {
      zone: ev.timezone,
    });
    if (!startLocal.isValid || !endLocal.isValid) continue;

    const dtStamp = DateTime.fromISO(ev.updatedAt, { zone: 'utc' }).isValid
      ? DateTime.fromISO(ev.updatedAt, { zone: 'utc' })
      : now;

    const uid = `${ev.id}@zenoti-schedule-calendar.local`;
    const summary = 'Work shift';
    const description = `Source: ${ev.source}\\nTimezone: ${ev.timezone}`;

    lines.push(
      'BEGIN:VEVENT',
      foldIcsLine(`UID:${escapeIcsText(uid)}`),
      `DTSTAMP:${formatUtc(dtStamp)}`,
      `DTSTART:${formatUtc(startLocal)}`,
      `DTEND:${formatUtc(endLocal)}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
      foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
