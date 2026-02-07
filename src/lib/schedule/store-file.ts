import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  scheduleFileSchema,
  type ScheduleEvent,
  type ScheduleFile,
} from '@/lib/schedule/types';
import type { ScheduleStore } from '@/lib/schedule/store';

function getDataDir(): string {
  return path.join(process.cwd(), 'data');
}

function getScheduleFilePath(): string {
  return path.join(getDataDir(), 'schedule.json');
}

function serializeScheduleFile(file: ScheduleFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

let writeChain: Promise<void> = Promise.resolve();

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = writeChain;
  let release: (() => void) | undefined;
  writeChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

async function readScheduleFile(): Promise<ScheduleFile> {
  const filePath = getScheduleFilePath();
  try {
    const contents = await readFile(filePath, 'utf8');
    const parsedJson: unknown = JSON.parse(contents);
    const parsed = scheduleFileSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(`Invalid schedule file format at ${filePath}`);
    }
    return parsed.data;
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return { version: 1, events: [] };
    }
    throw err;
  }
}

async function writeScheduleFileAtomic(file: ScheduleFile): Promise<void> {
  const dir = getDataDir();
  const filePath = getScheduleFilePath();
  const tmpPath = path.join(
    dir,
    `schedule.json.tmp.${process.pid}.${Date.now()}`,
  );

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, serializeScheduleFile(file), 'utf8');
  await rename(tmpPath, filePath);
}

export class FileScheduleStore implements ScheduleStore {
  async listEvents(): Promise<ScheduleEvent[]> {
    const file = await readScheduleFile();
    return file.events;
  }

  async setEvents(events: ScheduleEvent[]): Promise<void> {
    const parsed = scheduleFileSchema.safeParse({ version: 1, events });
    if (!parsed.success) {
      throw new Error('Refusing to write invalid schedule events.');
    }

    await withWriteLock(async () => {
      await writeScheduleFileAtomic(parsed.data);
    });
  }
}

export const scheduleStore = new FileScheduleStore();
