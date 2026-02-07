import { z } from 'zod';

const envSchema = z.object({
  MASTER_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  FEED_TOKEN: z.string().min(1).optional(),
  DEFAULT_TIMEZONE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function getRawEnv(): Record<string, string | undefined> {
  return {
    MASTER_PASSWORD: process.env.MASTER_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
    FEED_TOKEN: process.env.FEED_TOKEN,
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
  };
}

export function getEnv(): Env {
  const parsed = envSchema.safeParse(getRawEnv());
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Missing/invalid environment variables: ${message}`);
  }
  return parsed.data;
}

export function getDefaultTimezone(): string {
  const raw = process.env.DEFAULT_TIMEZONE;
  if (!raw || raw.trim().length === 0) return 'America/New_York';
  return raw;
}
