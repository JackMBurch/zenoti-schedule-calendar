import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { createWorker, PSM } from 'tesseract.js';

import { getDefaultTimezone } from '@/lib/env';
import { preprocessForOcr } from '@/lib/ocr/preprocess';
import { parseDraftShiftsFromOcrText } from '@/lib/ocr/parse';
import { extractWeeklyScheduleDraftShifts } from '@/lib/ocr/weeklySchedule';
import { maybeCleanupDrafts } from '@/lib/drafts/cleanup';
import { saveDraft } from '@/lib/drafts/store-file';
import {
  ocrResponseSchema,
  type OcrImageResult,
  type OcrResponse,
} from '@/lib/ocr/types';

export const runtime = 'nodejs';

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === 'object' && value instanceof File;
}

export async function POST(request: Request) {
  await maybeCleanupDrafts();

  const form = await request.formData();

  const timezoneRaw = form.get('timezone');
  const timezone =
    typeof timezoneRaw === 'string' && timezoneRaw.trim().length > 0
      ? timezoneRaw.trim()
      : getDefaultTimezone();

  const fileEntries = form.getAll('screenshots').filter(isFile);
  if (fileEntries.length === 0) {
    return NextResponse.json(
      { error: "No screenshots were uploaded. Use field name 'screenshots'." },
      { status: 400 },
    );
  }

  const batchId = randomUUID();

  const worker = await createWorker('eng');
  try {
    const images: OcrImageResult[] = [];

    for (const file of fileEntries) {
      const ab = await file.arrayBuffer();
      const input = Buffer.from(ab);
      const preprocessed = await preprocessForOcr(input);

      const structured = await extractWeeklyScheduleDraftShifts({
        image: preprocessed,
        timezone,
        source: batchId,
        worker,
      });

      // Fallback: if we couldn't detect any rows, revert to whole-image OCR + regex parsing.
      let text = structured.debugText;
      let shifts = structured.shifts;
      let mode: 'structured' | 'fallback' = 'structured';
      let debug: OcrImageResult['debug'] = {
        structured: structured.debug,
      };
      if (shifts.length === 0) {
        // Reset worker params so restrictive whitelists from structured crops
        // don't accidentally blank out the fallback whole-image OCR.
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:,-/<>|()[]{} .\n',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });

        const result = await worker.recognize(preprocessed);
        text = result.data.text ?? '';
        shifts = parseDraftShiftsFromOcrText({
          text,
          timezone,
          source: batchId,
        });
        mode = 'fallback';
        debug = {
          structured: structured.debug,
          fallbackText: text,
        };
      }

      images.push({
        filename: file.name || 'screenshot',
        text,
        shifts,
        mode,
        debug,
      });
    }

    const response: OcrResponse = {
      batchId,
      timezone,
      images,
    };

    const parsed = ocrResponseSchema.safeParse(response);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Internal response validation failed.' },
        { status: 500 },
      );
    }

    await saveDraft(parsed.data);
    return NextResponse.json(parsed.data);
  } finally {
    await worker.terminate();
  }
}
