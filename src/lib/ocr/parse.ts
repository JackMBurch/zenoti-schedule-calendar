import { randomUUID } from 'node:crypto';

import { DateTime } from 'luxon';

import type { DraftShift } from '@/lib/ocr/types';

function normalizeOcrText(text: string): string {
  return (
    text
      // common OCR confusion
      .replaceAll('O', '0')
      .replaceAll('l', '1')
      .replaceAll('\u00A0', ' ')
  );
}

type ParsedTime = { time: string; confidence: number };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseTime(raw: string): ParsedTime | null {
  const cleaned = raw.trim().toLowerCase().replaceAll(' ', '');
  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?([ap]m|[ap])?$/i);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    const isPm = meridiem.startsWith('p');
    const isAm = meridiem.startsWith('a');
    if (!isPm && !isAm) return null;

    if (hours < 1 || hours > 12) return null;

    let hh = hours % 12;
    if (isPm) hh += 12;
    const mm = minutes;
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return { time, confidence: 0.95 };
  }

  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const confidence = hours > 12 || hours === 0 ? 0.85 : 0.55;
  return { time, confidence };
}

function parseDateFromLine(line: string, now: Date): string | null {
  const trimmed = line.trim();

  const isoMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const mdY = trimmed.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const yearRaw = mdY[3];
    const year =
      yearRaw && yearRaw.length > 0
        ? yearRaw.length === 2
          ? 2000 + Number(yearRaw)
          : Number(yearRaw)
        : now.getFullYear();

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const monthNames =
    '(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)';
  const monthMatch = trimmed
    .toLowerCase()
    .match(new RegExp(`\\b${monthNames}\\b\\s+(\\d{1,2})\\b`));
  if (monthMatch) {
    const monthToken = monthMatch[1];
    const day = Number(monthMatch[2]);
    const monthIndex = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf(monthToken.slice(0, 3));
    if (monthIndex === -1 || day < 1 || day > 31) return null;
    const month = monthIndex + 1;
    const year = now.getFullYear();
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

const timeRangeRegex =
  /(\d{1,2}(?::\d{2})?\s*(?:[ap]m|[ap])?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]m|[ap])?)/gi;

const likelyActualTimeRegex =
  /\b(clock|clocked|actual|time\s*in|time\s*out|clock\s*in|clock\s*out)\b/i;

const weekdayNameRegex =
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

function weekdayToLuxon(weekday: string): number | null {
  const w = weekday.trim().toLowerCase();
  const map: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };
  return map[w] ?? null;
}

function parseWeekdayFromLine(line: string): string | null {
  const match = line.toLowerCase().match(weekdayNameRegex);
  return match ? (match[1] ?? null) : null;
}

function parseMonthTokenToNumber(token: string): number | null {
  const t = token.trim().toLowerCase();
  const key = t.slice(0, 3);
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return map[key] ?? null;
}

function parseWeekRangeFromText(
  text: string,
  timezone: string,
): { start: DateTime; end: DateTime } | null {
  const normalized = text.replaceAll('\n', ' ');
  const month =
    '(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)';
  const re = new RegExp(
    `\\b${month}\\s+(\\d{1,2}),\\s*(20\\d{2})\\s*-\\s*(?:${month}\\s+)?(\\d{1,2}),\\s*(20\\d{2})\\b`,
    'i',
  );
  const match = normalized.match(re);
  if (!match) return null;

  const startMonthToken = match[1] ?? '';
  const startDay = Number(match[2]);
  const startYear = Number(match[3]);
  const endMonthToken = match[4];
  const endDay = Number(match[5]);
  const endYear = Number(match[6]);

  const startMonth = parseMonthTokenToNumber(startMonthToken);
  const endMonth = parseMonthTokenToNumber(endMonthToken ?? startMonthToken);
  if (!startMonth || !endMonth) return null;
  if (!Number.isInteger(startDay) || !Number.isInteger(endDay)) return null;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return null;

  const start = DateTime.fromObject(
    { year: startYear, month: startMonth, day: startDay },
    { zone: timezone },
  ).startOf('day');
  const end = DateTime.fromObject(
    { year: endYear, month: endMonth, day: endDay },
    { zone: timezone },
  ).startOf('day');

  if (!start.isValid || !end.isValid) return null;
  return { start, end };
}

function isIsoDateOnOrBefore(a: string, b: string): boolean {
  // both are YYYY-MM-DD, so lexical ordering matches chronological ordering
  return a <= b;
}

function dedupePastAndTodayShifts(
  shifts: DraftShift[],
  timezone: string,
): DraftShift[] {
  const today =
    DateTime.now().setZone(timezone).toISODate() ??
    DateTime.now().toISODate() ??
    '9999-12-31';

  const seenDates = new Set<string>();
  const out: DraftShift[] = [];

  for (const shift of shifts) {
    // for future dates, allow multiple shifts on same day
    if (!isIsoDateOnOrBefore(shift.date, today)) {
      out.push(shift);
      continue;
    }

    // for today/past, keep only one shift per date per screenshot
    if (!seenDates.has(shift.date)) {
      out.push(shift);
      seenDates.add(shift.date);
      continue;
    }

    // if we already kept one, prefer replacing it only if the kept one looks like "actual time"
    // and the new one does not. This preserves the intended scheduled shift.
    const existingIndex = out.findIndex((s) => s.date === shift.date);
    if (existingIndex === -1) continue;

    const existing = out[existingIndex];
    const existingLooksActual = likelyActualTimeRegex.test(existing.raw);
    const newLooksActual = likelyActualTimeRegex.test(shift.raw);

    if (existingLooksActual && !newLooksActual) {
      out[existingIndex] = shift;
    }
  }

  return out;
}

export function parseDraftShiftsFromOcrText(params: {
  text: string;
  timezone: string;
  source: string;
  now?: Date;
}): DraftShift[] {
  const now = params.now ?? new Date();
  const normalized = normalizeOcrText(params.text);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const weekRange = parseWeekRangeFromText(normalized, params.timezone);

  let currentDate: string | null = null;
  const shifts: DraftShift[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const maybeDate = parseDateFromLine(line, now);
    if (maybeDate) {
      currentDate = maybeDate;
    }

    const ranges = Array.from(line.matchAll(timeRangeRegex));
    if (ranges.length === 0) continue;

    // In Zenoti's weekly list view, the *scheduled* line includes "Working" and the
    // "actual" time (when present) is on the next line without "Working".
    // Prefer only lines that include "Working" when possible.
    const isLikelyScheduledLine = /\bworking\b/i.test(line);
    if (!isLikelyScheduledLine && ranges.length > 0) {
      // If we don't have "Working" on the line, we still allow parsing as a fallback
      // (older parser behavior), but this may pick up clock-in/out lines too.
    }

    // Use the first time range on the line (scheduled line should contain exactly one).
    const range = ranges[0];
    if (!range) continue;
    const startRaw = range[1] ?? '';
    const endRaw = range[2] ?? '';

    const start = parseTime(startRaw);
    const end = parseTime(endRaw);
    if (!start || !end) continue;

    // If we have a week range, try to resolve date from the nearby weekday label.
    let date: string | null = null;
    if (weekRange) {
      let weekday: string | null = null;
      // Look ahead a few lines to find the weekday for this row.
      for (let j = i; j < Math.min(lines.length, i + 7); j += 1) {
        const candidate = lines[j] ?? '';
        // stop if we hit the next scheduled line
        if (
          j !== i &&
          /\bworking\b/i.test(candidate) &&
          timeRangeRegex.test(candidate)
        )
          break;
        const w = parseWeekdayFromLine(candidate);
        if (w) {
          weekday = w;
          break;
        }
      }

      if (weekday) {
        const target = weekdayToLuxon(weekday);
        const base = weekRange.start;
        if (target) {
          const delta = (target - base.weekday + 7) % 7;
          const dt = base.plus({ days: delta });
          if (
            dt.isValid &&
            dt >= weekRange.start &&
            dt <= weekRange.end.plus({ days: 0 })
          ) {
            date = dt.toISODate();
          }
        }
      }
    }

    date = date ?? parseDateFromLine(line, now) ?? currentDate;
    if (!date) continue;

    const confidence = clamp01(
      (parseDateFromLine(line, now) ? 0.65 : 0.45) *
        start.confidence *
        end.confidence,
    );

    shifts.push({
      id: randomUUID(),
      date,
      startTime: start.time,
      endTime: end.time,
      timezone: params.timezone,
      source: params.source,
      confidence,
      raw: line,
    });
  }

  return dedupePastAndTodayShifts(shifts, params.timezone);
}
