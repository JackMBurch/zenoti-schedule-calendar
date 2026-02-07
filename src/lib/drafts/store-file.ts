import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ocrResponseSchema, type OcrResponse } from '@/lib/ocr/types';

function getDraftsDir(): string {
  return path.join(process.cwd(), 'data', 'drafts');
}

function getDraftPath(batchId: string): string {
  return path.join(getDraftsDir(), `${batchId}.json`);
}

function serialize(value: OcrResponse): string {
  return JSON.stringify(value, null, 2) + '\n';
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as unknown;
}

export async function saveDraft(draft: OcrResponse): Promise<void> {
  const parsed = ocrResponseSchema.safeParse(draft);
  if (!parsed.success) throw new Error('Refusing to persist invalid draft.');

  const dir = getDraftsDir();
  const filePath = getDraftPath(draft.batchId);
  const tmpPath = path.join(
    dir,
    `${draft.batchId}.tmp.${process.pid}.${Date.now()}.json`,
  );

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, serialize(parsed.data), 'utf8');
  await rename(tmpPath, filePath);
}

export async function loadDraft(batchId: string): Promise<OcrResponse | null> {
  const filePath = getDraftPath(batchId);
  try {
    const json: unknown = await readJsonFile(filePath);
    const parsed = ocrResponseSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data;
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw err;
  }
}

export async function deleteDraft(batchId: string): Promise<void> {
  const filePath = getDraftPath(batchId);
  try {
    await unlink(filePath);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }
    throw err;
  }
}
