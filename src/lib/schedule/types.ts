import { z } from 'zod';

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Expected HH:mm')
  .refine((value) => {
    const [h, m] = value.split(':').map((part) => Number(part));
    return (
      Number.isInteger(h) &&
      Number.isInteger(m) &&
      h >= 0 &&
      h <= 23 &&
      m >= 0 &&
      m <= 59
    );
  }, 'Invalid time');

export const scheduleEventSchema = z.object({
  id: z.string().min(1),
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  timezone: z.string().min(1),
  source: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type ScheduleEvent = z.infer<typeof scheduleEventSchema>;

export const scheduleFileSchema = z.object({
  version: z.literal(1),
  events: z.array(scheduleEventSchema),
});

export type ScheduleFile = z.infer<typeof scheduleFileSchema>;
