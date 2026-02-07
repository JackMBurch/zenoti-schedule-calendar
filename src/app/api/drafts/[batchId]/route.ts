import { NextResponse } from 'next/server';
import { z } from 'zod';

import { maybeCleanupDrafts } from '@/lib/drafts/cleanup';
import { deleteDraft, loadDraft } from '@/lib/drafts/store-file';

export const runtime = 'nodejs';

const batchIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  await maybeCleanupDrafts();
  const params = await context.params;
  const parsedId = batchIdSchema.safeParse(params.batchId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid batchId.' }, { status: 400 });
  }

  const draft = await loadDraft(parsedId.data);
  if (!draft) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json(draft);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  await maybeCleanupDrafts();
  const params = await context.params;
  const parsedId = batchIdSchema.safeParse(params.batchId);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid batchId.' }, { status: 400 });
  }

  await deleteDraft(parsedId.data);
  return NextResponse.json({ ok: true });
}
