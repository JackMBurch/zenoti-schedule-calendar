import { z } from 'zod';

import { scheduleEventSchema } from '@/lib/schedule/types';

export const draftShiftSchema = scheduleEventSchema
  .pick({
    date: true,
    startTime: true,
    endTime: true,
    timezone: true,
    source: true,
  })
  .extend({
    id: z.string().min(1),
    confidence: z.number().min(0).max(1),
    raw: z.string().min(1),
  });

export type DraftShift = z.infer<typeof draftShiftSchema>;

const ocrModeSchema = z.enum(['structured', 'fallback']);

const weeklyScheduleDebugSchema = z.object({
  crops: z.object({
    header: z.object({
      left: z.number().int(),
      top: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
    }),
    list: z.object({
      left: z.number().int(),
      top: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
    }),
    rightColumn: z.object({
      left: z.number().int(),
      top: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  }),
  image: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  header: z.object({
    text: z.string(),
    year: z.number().int().optional(),
    month: z.number().int().optional(),
    confidence: z.number().min(0).max(1),
  }),
  rightColumn: z.object({
    text: z.string(),
    wordCount: z.number().int().min(0),
    rowsDetected: z.number().int().min(0),
    detectionMethod: z.enum(['words', 'projection', 'text']),
    typicalRowPx: z.number().min(0),
  }),
  rows: z.array(
    z.object({
      index: z.number().int().min(0),
      yCenterPx: z.number().min(0),
      band: z.object({
        top: z.number().int().min(0),
        height: z.number().int().min(1),
      }),
      crops: z.object({
        day: z.object({
          left: z.number().int(),
          top: z.number().int(),
          width: z.number().int(),
          height: z.number().int(),
        }),
        month: z.object({
          left: z.number().int(),
          top: z.number().int(),
          width: z.number().int(),
          height: z.number().int(),
        }),
        weekday: z.object({
          left: z.number().int(),
          top: z.number().int(),
          width: z.number().int(),
          height: z.number().int(),
        }),
        scheduled: z.object({
          left: z.number().int(),
          top: z.number().int(),
          width: z.number().int(),
          height: z.number().int(),
        }),
      }),
      dayText: z.string(),
      monthText: z.string(),
      weekdayText: z.string(),
      scheduledText: z.string(),
      parsedDate: z.string().optional(),
      parsedStart: z.string().optional(),
      parsedEnd: z.string().optional(),
      skippedReason: z.string().optional(),
    }),
  ),
});

export const ocrImageResultSchema = z.object({
  filename: z.string().min(1),
  text: z.string(),
  shifts: z.array(draftShiftSchema),
  mode: ocrModeSchema,
  debug: z
    .object({
      structured: weeklyScheduleDebugSchema.optional(),
      fallbackText: z.string().optional(),
    })
    .optional(),
});

export type OcrImageResult = z.infer<typeof ocrImageResultSchema>;

export const ocrResponseSchema = z.object({
  batchId: z.string().min(1),
  timezone: z.string().min(1),
  images: z.array(ocrImageResultSchema),
});

export type OcrResponse = z.infer<typeof ocrResponseSchema>;
