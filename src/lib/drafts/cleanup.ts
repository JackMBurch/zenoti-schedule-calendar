import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getDraftsDir(): string {
  return path.join(process.cwd(), 'data', 'drafts');
}

let lastCleanupAtMs: number | null = null;
let cleanupInFlight: Promise<void> | null = null;

function shouldLog(): boolean {
  return process.env.DRAFT_CLEANUP_DEBUG === '1';
}

export async function maybeCleanupDrafts(): Promise<void> {
  const now = Date.now();
  if (lastCleanupAtMs !== null && now - lastCleanupAtMs < MIN_INTERVAL_MS)
    return;
  if (cleanupInFlight) return cleanupInFlight;

  cleanupInFlight = (async () => {
    const dir = getDraftsDir();
    let entries: string[];
    try {
      entries = await readdir(dir);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // no drafts dir yet
      lastCleanupAtMs = now;
      return;
    }

    let deleted = 0;
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const fullPath = path.join(dir, name);
      try {
        const s = await stat(fullPath);
        const ageMs = now - s.mtimeMs;
        if (ageMs > TTL_MS) {
          await unlink(fullPath);
          deleted += 1;
        }
      } catch {
        // ignore individual file failures
      }
    }

    if (shouldLog() && deleted > 0) {
      console.log(
        `[drafts] cleanup deleted ${deleted} files older than ${TTL_DAYS} days`,
      );
    }

    lastCleanupAtMs = now;
  })().finally(() => {
    cleanupInFlight = null;
  });

  return cleanupInFlight;
}
