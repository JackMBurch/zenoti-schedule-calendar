import { z } from 'zod';

import { draftShiftSchema } from '@/lib/ocr/types';
import { scheduleEventSchema } from '@/lib/schedule/types';

export const conflictResolutionSchema = z.enum(['replace', 'keep', 'add']);

export const publishDecisionSchema = z.object({
  date: scheduleEventSchema.shape.date,
  resolution: conflictResolutionSchema,
});

export type PublishDecision = z.infer<typeof publishDecisionSchema>;

export const publishRequestSchema = z.object({
  batchId: z.string().min(1),
  timezone: z.string().min(1),
  shifts: z.array(draftShiftSchema),
  decisions: z.array(publishDecisionSchema).optional(),
});

export type PublishRequest = z.infer<typeof publishRequestSchema>;

export const publishConflictSchema = z.object({
  date: scheduleEventSchema.shape.date,
  existing: z.array(scheduleEventSchema),
  proposed: z.array(scheduleEventSchema),
});

export type PublishConflict = z.infer<typeof publishConflictSchema>;

export const publishConflictResponseSchema = z.object({
  error: z.literal('conflicts'),
  conflicts: z.array(publishConflictSchema),
});

export type PublishConflictResponse = z.infer<
  typeof publishConflictResponseSchema
>;

export const publishOkResponseSchema = z.object({
  ok: z.literal(true),
  events: z.array(scheduleEventSchema),
});

export type PublishOkResponse = z.infer<typeof publishOkResponseSchema>;
