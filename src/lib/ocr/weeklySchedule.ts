import { randomUUID } from 'node:crypto';

import { DateTime } from 'luxon';
import sharp from 'sharp';

import type { DraftShift } from '@/lib/ocr/types';

type TesseractBbox = { x0: number; y0: number; x1: number; y1: number };
type TesseractWord = { text: string; bbox: TesseractBbox; confidence: number };

type RecognizeResult = {
  data: {
    text?: string;
    confidence?: number;
    words?: TesseractWord[];
  };
};

export type MinimalTesseractWorker = {
  setParameters(params: Record<string, string>): Promise<unknown>;
  recognize(
    image: Buffer,
    opts?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ): Promise<RecognizeResult>;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeWorkingToken(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '')
    .replaceAll('1', 'i');
}

function looksLikeWorking(value: string): boolean {
  return normalizeWorkingToken(value) === 'working';
}

function parseMonthName(value: string): number | null {
  const v = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z]/g, '');
  const token = v.slice(0, 3);
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
  const direct = map[token];
  if (direct) return direct;

  // Common OCR for February: "feh", "fah", "fab", etc.
  if (token.startsWith('f') && (token[1] === 'e' || token[1] === 'a')) return 2;

  // Light fuzzy match on 3-letter month tokens.
  const keys = Object.keys(map);
  let best: { key: string; dist: number } | null = null;
  for (const k of keys) {
    let dist = 0;
    for (let i = 0; i < 3; i += 1) {
      if ((token[i] ?? '') !== (k[i] ?? '')) dist += 1;
    }
    if (!best || dist < best.dist) best = { key: k, dist };
  }
  if (best && best.dist <= 1) return map[best.key] ?? null;
  return null;
}

function parseWeekStartFromHeaderText(
  text: string,
): { year: number; month: number; day: number } | null {
  const match = text.match(/\b([A-Za-z]{3,})\s+(\d{1,2})[,]?\s*(20\d{2})\b/);
  if (!match) return null;
  const month = parseMonthName(match[1] ?? '');
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(year)) return null;
  return { year, month, day };
}

const weekdayRegex =
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

function parseWeekday(text: string): string | null {
  const match = text.toLowerCase().match(weekdayRegex);
  return match ? (match[1] ?? null) : null;
}

function weekdayToLuxon(weekday: string): number | null {
  const w = weekday.toLowerCase();
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

function dateFromWeekStartAndWeekday(params: {
  weekStart: { year: number; month: number; day: number };
  weekday: string;
  timezone: string;
}): string | null {
  const base = DateTime.fromObject(
    {
      year: params.weekStart.year,
      month: params.weekStart.month,
      day: params.weekStart.day,
    },
    { zone: params.timezone },
  );
  const target = weekdayToLuxon(params.weekday);
  if (!base.isValid || !target) return null;
  const delta = (target - base.weekday + 7) % 7;
  return base.plus({ days: delta }).toISODate();
}

function weekdayMatchesDate(params: {
  date: string;
  weekday: string;
  timezone: string;
}): boolean {
  const dt = DateTime.fromISO(params.date, { zone: params.timezone });
  const target = weekdayToLuxon(params.weekday);
  return Boolean(dt.isValid && target && dt.weekday === target);
}

function isWithinWeek(params: {
  date: string;
  weekStart: { year: number; month: number; day: number };
  timezone: string;
}): boolean {
  const dt = DateTime.fromISO(params.date, { zone: params.timezone });
  const base = DateTime.fromObject(
    {
      year: params.weekStart.year,
      month: params.weekStart.month,
      day: params.weekStart.day,
    },
    { zone: params.timezone },
  );
  if (!dt.isValid || !base.isValid) return false;
  const end = base.plus({ days: 6 }).endOf('day');
  return dt >= base.startOf('day') && dt <= end;
}

function parseYearFromText(text: string): number | null {
  const match = text.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function normalizeYear(rawYear: number, timezone: string): number {
  const nowYear = DateTime.now().setZone(timezone).year;
  // Schedules are current/near-future; correct obvious OCR errors like 2076 vs 2026.
  if (rawYear < nowYear - 1 || rawYear > nowYear + 1) return nowYear;
  return rawYear;
}

function parseHeaderMonthFromText(text: string): number | null {
  const match = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\b/i,
  );
  if (!match) return null;
  return parseMonthName(match[1] ?? '');
}

type ParsedTime24 = { hhmm: string; confidence: number };

function parseTimeTo24h(raw: string): ParsedTime24 | null {
  const cleaned = raw.trim().toLowerCase().replaceAll(/\s+/g, '');
  const match = cleaned.match(/^(\d{1,2}):(\d{2})([ap]m)$/);
  if (!match) return null;

  const hours12 = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (!Number.isInteger(hours12) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  // Heuristic for OCR: sometimes "10:00" becomes "0:00" (missing leading 1).
  // In a 12h clock representation, "0:xx am/pm" is invalid.
  const normalizedHours12 = hours12 === 0 ? 10 : hours12;
  if (normalizedHours12 < 1 || normalizedHours12 > 12) return null;

  let hh = normalizedHours12 % 12;
  if (meridiem === 'pm') hh += 12;

  return {
    hhmm: `${String(hh).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    confidence: 0.98,
  };
}

function normalizeDash(value: string): string {
  return value.replaceAll('–', '-').replaceAll('—', '-');
}

function parseScheduledRange(
  text: string,
): { start: string; end: string; confidence: number } | null {
  // Normalize common OCR confusions for times.
  let t = normalizeDash(text)
    .replaceAll('O', '0')
    .replaceAll('l', '1')
    .replaceAll('I', '1');
  t = t.replaceAll(/(\d)o(?=:\d{2})/g, '$10');
  t = t.replaceAll(/(^|\s)o(?=:\d{2})/g, '$10');

  // Insert colon for patterns like "1000 am"
  t = t.replaceAll(/(\b\d{1,2})(\d{2})\s*(am|pm)\b/gi, '$1:$2 $3');
  // OCR sometimes reads "am" as "2m"
  t = t.replaceAll(/\b2m\b/gi, 'am');
  t = t.toLowerCase().replaceAll(/\s+/g, ' ').trim();

  const match = t.match(
    /(\d{1,2}:\d{2})\s*(am|pm)\s*-\s*(\d{1,2}:\d{2})\s*(am|pm)/,
  );
  const getFromTimeTokens = (): {
    start: string;
    end: string;
    confidence: number;
  } | null => {
    const tokens = Array.from(t.matchAll(/(\d{1,2}:\d{2})\s*(am|pm)\b/g));
    if (tokens.length < 2) return null;
    const a = tokens[0];
    const b = tokens[1];
    if (!a || !b) return null;
    const start = parseTimeTo24h(`${a[1]}${a[2]}`);
    const end = parseTimeTo24h(`${b[1]}${b[2]}`);
    if (!start || !end) return null;
    return {
      start: start.hhmm,
      end: end.hhmm,
      confidence: clamp01(start.confidence * end.confidence * 0.9),
    };
  };

  if (!match) {
    return getFromTimeTokens();
  }

  const start = parseTimeTo24h(`${match[1]}${match[2]}`);
  const end = parseTimeTo24h(`${match[3]}${match[4]}`);
  if (!start || !end) return null;

  return {
    start: start.hhmm,
    end: end.hhmm,
    confidence: clamp01(start.confidence * end.confidence),
  };
}

async function cropBuffer(params: {
  image: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
}): Promise<Buffer> {
  return sharp(params.image)
    .extract({
      left: Math.max(0, params.left),
      top: Math.max(0, params.top),
      width: Math.max(1, params.width),
      height: Math.max(1, params.height),
    })
    .toBuffer();
}

async function enhanceCropForOcr(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({ width: 900, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .threshold(170)
    .toBuffer();
}

async function enhanceCropForTimeOcr(input: Buffer): Promise<Buffer> {
  // Times are relatively thin/gray; avoid hard thresholding which can erase characters.
  return sharp(input)
    .resize({ width: 1200, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
}

async function detectRowCentersByProjection(params: {
  image: Buffer;
  expectedCount: number;
}): Promise<number[]> {
  if (params.expectedCount <= 0) return [];

  const { data, info } = await sharp(params.image)
    .grayscale()
    .normalize()
    .threshold(210)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  if (!w || !h) return [];

  // Score per y: number of dark pixels in that row.
  const scores = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    const rowStart = y * w;
    for (let x = 0; x < w; x += 1) {
      const v = data[rowStart + x] ?? 255; // 0=black,255=white
      sum += 255 - v;
    }
    scores[y] = sum;
  }

  // Smooth with moving average.
  const window = Math.max(5, Math.floor(h / 220));
  const smooth = new Array<number>(h).fill(0);
  for (let y = 0; y < h; y += 1) {
    let acc = 0;
    let n = 0;
    for (let k = -window; k <= window; k += 1) {
      const yy = y + k;
      if (yy < 0 || yy >= h) continue;
      acc += scores[yy] ?? 0;
      n += 1;
    }
    smooth[y] = n > 0 ? acc / n : 0;
  }

  const maxScore = Math.max(...smooth);
  if (!Number.isFinite(maxScore) || maxScore <= 0) return [];

  // Find local maxima above threshold.
  const minPeak = maxScore * 0.35;
  const candidates: Array<{ y: number; score: number }> = [];
  for (let y = 2; y < h - 2; y += 1) {
    const s = smooth[y] ?? 0;
    if (s < minPeak) continue;
    if (
      s >= (smooth[y - 1] ?? 0) &&
      s >= (smooth[y + 1] ?? 0) &&
      s >= (smooth[y - 2] ?? 0) &&
      s >= (smooth[y + 2] ?? 0)
    ) {
      candidates.push({ y, score: s });
    }
  }

  // Enforce minimum distance between peaks and select the best ones.
  const minDist = Math.max(18, Math.floor(h / (params.expectedCount * 2.2)));
  candidates.sort((a, b) => b.score - a.score);

  const chosen: Array<{ y: number; score: number }> = [];
  for (const c of candidates) {
    if (chosen.some((p) => Math.abs(p.y - c.y) < minDist)) continue;
    chosen.push(c);
    if (chosen.length >= params.expectedCount) break;
  }

  return chosen.map((p) => p.y).sort((a, b) => a - b);
}

async function recognizeText(params: {
  worker: MinimalTesseractWorker;
  image: Buffer;
  psm: string;
  whitelist: string;
}): Promise<{ text: string; confidence: number; words: TesseractWord[] }> {
  await params.worker.setParameters({
    tessedit_pageseg_mode: params.psm,
    tessedit_char_whitelist: params.whitelist,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });

  const result = await params.worker.recognize(
    params.image,
    {},
    { text: true, words: true },
  );
  const text = (result.data.text ?? '').trim();
  const rawConf =
    typeof result.data.confidence === 'number' ? result.data.confidence : 0;
  const confidence = clamp01(rawConf / 100);
  const words = Array.isArray(result.data.words) ? result.data.words : [];
  return { text, confidence, words };
}

export async function extractWeeklyScheduleDraftShifts(params: {
  imageDetection: Buffer;
  imageText: Buffer;
  timezone: string;
  source: string;
  worker: MinimalTesseractWorker;
}): Promise<{
  debugText: string;
  shifts: DraftShift[];
  debug: {
    crops: {
      header: { left: number; top: number; width: number; height: number };
      list: { left: number; top: number; width: number; height: number };
      rightColumn: { left: number; top: number; width: number; height: number };
    };
    image: { width: number; height: number };
    header: { text: string; year?: number; month?: number; confidence: number };
    rightColumn: {
      text: string;
      wordCount: number;
      rowsDetected: number;
      detectionMethod: 'words' | 'projection' | 'text';
      typicalRowPx: number;
    };
    rows: Array<{
      index: number;
      yCenterPx: number;
      band: { top: number; height: number };
      crops: {
        day: { left: number; top: number; width: number; height: number };
        month: { left: number; top: number; width: number; height: number };
        weekday: { left: number; top: number; width: number; height: number };
        scheduled: { left: number; top: number; width: number; height: number };
      };
      dayText: string;
      monthText: string;
      weekdayText: string;
      scheduledText: string;
      parsedDate?: string;
      parsedStart?: string;
      parsedEnd?: string;
      skippedReason?: string;
    }>;
  };
}> {
  const meta = await sharp(params.imageDetection).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    return {
      debugText: 'Missing image dimensions',
      shifts: [],
      debug: {
        crops: {
          header: { left: 0, top: 0, width: 1, height: 1 },
          list: { left: 0, top: 0, width: 1, height: 1 },
          rightColumn: { left: 0, top: 0, width: 1, height: 1 },
        },
        image: { width: 1, height: 1 },
        header: { text: '', confidence: 0 },
        rightColumn: {
          text: '',
          wordCount: 0,
          rowsDetected: 0,
          detectionMethod: 'text',
          typicalRowPx: 0,
        },
        rows: [],
      },
    };
  }

  // Broad top crop to catch the week range line (contains year and usually month).
  const headerRect = {
    left: 0,
    // Tighten header crop so it doesn't include list rows.
    top: Math.round(height * 0.17),
    width,
    height: Math.round(height * 0.12),
  };
  const headerCrop = await cropBuffer({
    image: params.imageText,
    ...headerRect,
  });

  const headerOcr = await recognizeText({
    worker: params.worker,
    image: headerCrop,
    psm: '11', // SPARSE_TEXT
    whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,-:<>/ ',
  });
  const rawHeaderYear = parseYearFromText(headerOcr.text);
  const rawHeaderMonth = parseHeaderMonthFromText(headerOcr.text);
  const rawWeekStart = parseWeekStartFromHeaderText(headerOcr.text);

  const nowYear =
    DateTime.now().setZone(params.timezone).year || DateTime.now().year;
  const year = normalizeYear(
    rawHeaderYear ?? rawWeekStart?.year ?? nowYear,
    params.timezone,
  );
  const weekStart = rawWeekStart
    ? {
        ...rawWeekStart,
        year: normalizeYear(rawWeekStart.year, params.timezone),
      }
    : null;
  const headerMonth = rawHeaderMonth ?? weekStart?.month ?? null;

  // Crop a generous list region; we will detect rows based on the "Working" token.
  // Start below the header + warning banner region, end above bottom nav.
  const listTop =
    headerRect.top + headerRect.height + Math.round(height * 0.01);
  const listBottom = Math.round(height * 0.86);
  const listHeight = Math.max(1, listBottom - listTop);
  const listRect = { left: 0, top: listTop, width, height: listHeight };
  const listCropDetection = await cropBuffer({
    image: params.imageDetection,
    ...listRect,
  });
  const listCropText = await cropBuffer({ image: params.imageText, ...listRect });

  const rightRect = {
    left: Math.round(width * 0.7),
    top: 0,
    width: Math.round(width * 0.3),
    height: listHeight,
  };
  const rightCol = await cropBuffer({ image: listCropDetection, ...rightRect });

  const rightOcr = await recognizeText({
    worker: params.worker,
    image: rightCol,
    psm: '4', // SINGLE_COLUMN
    whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  });

  const workingYsFromWords = rightOcr.words
    .filter((w) => looksLikeWorking(w.text))
    .map((w) => (w.bbox.y0 + w.bbox.y1) / 2)
    .sort((a, b) => a - b);

  const workingCountFromText = (() => {
    const matches = rightOcr.text.match(/\bworking\b/gi);
    return matches ? matches.length : 0;
  })();

  const projectedYs =
    workingYsFromWords.length === 0 && workingCountFromText > 0
      ? await detectRowCentersByProjection({
          image: rightCol,
          expectedCount: workingCountFromText,
        })
      : [];

  const detectionMethod: 'words' | 'projection' | 'text' =
    workingYsFromWords.length > 0
      ? 'words'
      : projectedYs.length > 0
        ? 'projection'
        : 'text';

  const workingYsBase =
    detectionMethod === 'words'
      ? workingYsFromWords
      : detectionMethod === 'projection'
        ? projectedYs
        : Array.from({ length: workingCountFromText }, (_, i) => {
            // When we lack bounding boxes, avoid the very top/bottom of the list crop.
            const topPad = listHeight * 0.03;
            const bottomPad = listHeight * 0.03;
            const usable = Math.max(1, listHeight - topPad - bottomPad);
            const frac = (i + 0.5) / Math.max(1, workingCountFromText);
            return topPad + frac * usable;
          });

  const deltasBase = workingYsBase
    .slice(1)
    .map((y, i) => y - workingYsBase[i])
    .filter((d) => d > 20);
  const typicalRow = median(deltasBase) ?? 140;

  // Projection peaks often align with the chevron/label area (slightly above the true row center).
  // Nudge down so left/middle column crops hit the large day number and scheduled time line.
  const projectionYOffset = Math.round(typicalRow * 0.22);
  const workingYs =
    detectionMethod === 'projection'
      ? workingYsBase.map((y) =>
          Math.max(0, Math.min(listHeight - 1, y + projectionYOffset)),
        )
      : workingYsBase;

  const shifts: DraftShift[] = [];
  const debugLines: string[] = [];
  debugLines.push(`headerText=${JSON.stringify(headerOcr.text)}`);
  debugLines.push(`year=${year} headerMonth=${headerMonth ?? '?'}`);
  debugLines.push(
    `rowsDetected=${workingYs.length} method=${detectionMethod} wordCount=${rightOcr.words.length}`,
  );

  const debug = {
    crops: { header: headerRect, list: listRect, rightColumn: rightRect },
    image: { width, height },
    header: {
      text: headerOcr.text,
      year: year,
      month: headerMonth ?? undefined,
      confidence: headerOcr.confidence,
    },
    rightColumn: {
      text: rightOcr.text,
      wordCount: rightOcr.words.length,
      rowsDetected: workingYs.length,
      detectionMethod,
      typicalRowPx: typicalRow,
    },
    rows: [] as Array<{
      index: number;
      yCenterPx: number;
      band: { top: number; height: number };
      crops: {
        day: { left: number; top: number; width: number; height: number };
        month: { left: number; top: number; width: number; height: number };
        weekday: { left: number; top: number; width: number; height: number };
        scheduled: { left: number; top: number; width: number; height: number };
      };
      dayText: string;
      monthText: string;
      weekdayText: string;
      scheduledText: string;
      parsedDate?: string;
      parsedStart?: string;
      parsedEnd?: string;
      skippedReason?: string;
    }>,
  };

  for (const [index, y] of workingYs.entries()) {
    const bandTop = Math.max(0, Math.round(y - typicalRow * 0.48));
    const bandHeight = Math.min(
      listHeight - bandTop,
      Math.round(typicalRow * 0.96),
    );
    const band = { top: bandTop, height: Math.max(1, Math.round(bandHeight)) };

    // OCR day-of-month (large two-digit number)
    const dayRect = {
      left: Math.round(width * 0.08),
      top: bandTop + Math.round(bandHeight * 0.14),
      width: Math.round(width * 0.22),
      height: Math.round(bandHeight * 0.56),
    };
    const dayCrop = await cropBuffer({
      image: listCropText,
      ...dayRect,
    });

    const dayOcr = await recognizeText({
      worker: params.worker,
      image: await enhanceCropForOcr(dayCrop),
      psm: '6', // SINGLE_BLOCK
      whitelist: '0123456789Oo',
    });
    const dayDigits = dayOcr.text.replaceAll(/[^\d]/g, '');
    const day =
      dayDigits.length === 0
        ? null
        : String(Number(dayDigits.slice(-2))).padStart(2, '0');

    // OCR month name (small text above the day)
    const monthRect = {
      left: Math.round(width * 0.03),
      top: bandTop + Math.round(bandHeight * 0.02),
      width: Math.round(width * 0.3),
      height: Math.round(bandHeight * 0.24),
    };
    const monthCrop = await cropBuffer({
      image: listCropText,
      ...monthRect,
    });
    const monthOcr = await recognizeText({
      worker: params.worker,
      image: monthCrop,
      psm: '7', // SINGLE_LINE
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });
    const month = parseMonthName(monthOcr.text) ?? headerMonth;

    // OCR weekday (below day number)
    const weekdayRect = {
      left: Math.round(width * 0.03),
      top: bandTop + Math.round(bandHeight * 0.7),
      width: Math.round(width * 0.3),
      height: Math.round(bandHeight * 0.26),
    };
    const weekdayCrop = await cropBuffer({
      image: listCropText,
      ...weekdayRect,
    });
    const weekdayOcr = await recognizeText({
      worker: params.worker,
      image: await enhanceCropForOcr(weekdayCrop),
      psm: '7', // SINGLE_LINE
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });
    const weekday = parseWeekday(weekdayOcr.text);

    // OCR scheduled time line only (top line of middle column)
    const timeRect = {
      left: Math.round(width * 0.28),
      top: bandTop + Math.round(bandHeight * 0.08),
      width: Math.round(width * 0.5),
      height: Math.round(bandHeight * 0.36),
    };
    const timeCrop = await cropBuffer({
      image: listCropText,
      ...timeRect,
    });
    const timeOcr = await recognizeText({
      worker: params.worker,
      image: await enhanceCropForTimeOcr(timeCrop),
      psm: '7', // SINGLE_LINE
      whitelist: '0123456789:apmAPM -',
    });

    const debugRow: {
      index: number;
      yCenterPx: number;
      band: { top: number; height: number };
      crops: {
        day: { left: number; top: number; width: number; height: number };
        month: { left: number; top: number; width: number; height: number };
        weekday: { left: number; top: number; width: number; height: number };
        scheduled: { left: number; top: number; width: number; height: number };
      };
      dayText: string;
      monthText: string;
      weekdayText: string;
      scheduledText: string;
      parsedDate?: string;
      parsedStart?: string;
      parsedEnd?: string;
      skippedReason?: string;
    } = {
      index,
      yCenterPx: y,
      band,
      crops: {
        day: dayRect,
        month: monthRect,
        weekday: weekdayRect,
        scheduled: timeRect,
      },
      dayText: dayOcr.text,
      monthText: monthOcr.text,
      weekdayText: weekdayOcr.text,
      scheduledText: timeOcr.text,
    };

    const range = parseScheduledRange(timeOcr.text);

    // Date resolution:
    // - Prefer exact day+month (from left column).
    // - If day is missing, try header week start + weekday label.
    let resolvedDate: string | null = null;
    const dateFromDayMonth =
      day && month
        ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${day}`
        : null;
    const dateFromWeekday =
      weekStart && weekday
        ? dateFromWeekStartAndWeekday({
            weekStart,
            weekday,
            timezone: params.timezone,
          })
        : null;

    resolvedDate = dateFromDayMonth ?? dateFromWeekday;

    // Robustness: if OCR misreads the day number (e.g. "08" -> "03"), it can
    // conflict with the weekday label and/or the header’s week range. When we
    // have a header week start and a weekday label, prefer the weekday-derived
    // date if the day-derived date looks inconsistent.
    if (resolvedDate && dateFromDayMonth && dateFromWeekday && weekStart && weekday) {
      const weekdayOk = weekdayMatchesDate({
        date: dateFromDayMonth,
        weekday,
        timezone: params.timezone,
      });
      const inWeek = isWithinWeek({
        date: dateFromDayMonth,
        weekStart,
        timezone: params.timezone,
      });
      if (!weekdayOk || !inWeek) {
        resolvedDate = dateFromWeekday;
      }
    }

    if (!resolvedDate) {
      const reason = 'missing date';
      debugLines.push(
        `skipRow ${reason} dayText=${JSON.stringify(dayOcr.text)} weekdayText=${JSON.stringify(weekdayOcr.text)} monthText=${JSON.stringify(monthOcr.text)}`,
      );
      debugRow.skippedReason = reason;
      debug.rows.push(debugRow);
      continue;
    }

    if (!range) {
      const reason = 'bad scheduled time parse';
      debugLines.push(
        `skipRow ${reason} timeText=${JSON.stringify(timeOcr.text)}`,
      );
      debugRow.skippedReason = reason;
      debugRow.parsedDate = resolvedDate;
      debug.rows.push(debugRow);
      continue;
    }

    const confidence = clamp01(
      range.confidence * (0.35 + 0.65 * timeOcr.confidence),
    );

    debugRow.parsedDate = resolvedDate;
    debugRow.parsedStart = range.start;
    debugRow.parsedEnd = range.end;
    debug.rows.push(debugRow);

    shifts.push({
      id: randomUUID(),
      date: resolvedDate,
      startTime: range.start,
      endTime: range.end,
      timezone: params.timezone,
      source: params.source,
      confidence,
      raw: `month=${monthOcr.text} day=${dayOcr.text} scheduled=${timeOcr.text}`,
    });
  }

  // sort by date+time for stable UI
  shifts.sort((a, b) =>
    `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
  );

  return { debugText: debugLines.join('\n'), shifts, debug };
}
