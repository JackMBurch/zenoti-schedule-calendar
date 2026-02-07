'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  draftShiftSchema,
  ocrResponseSchema,
  type DraftShift,
  type OcrResponse,
} from '@/lib/ocr/types';
import {
  publishConflictResponseSchema,
  type PublishConflict,
  type PublishDecision,
} from '@/lib/publish/types';

type EditableShift = DraftShift & {
  imageFilename: string;
  imageMode: OcrResponse['images'][number]['mode'];
};

function flattenShifts(data: OcrResponse): EditableShift[] {
  const out: EditableShift[] = [];
  for (const img of data.images) {
    for (const shift of img.shifts) {
      out.push({
        ...shift,
        imageFilename: img.filename,
        imageMode: img.mode,
      });
    }
  }
  return out;
}

function summarizeImageDebug(draft: OcrResponse) {
  return draft.images.map((img) => ({
    filename: img.filename,
    mode: img.mode,
    shiftCount: img.shifts.length,
    structuredRowsDetected:
      img.debug?.structured?.rightColumn.rowsDetected ?? null,
    detectionMethod: img.debug?.structured?.rightColumn.detectionMethod ?? null,
    wordCount: img.debug?.structured?.rightColumn.wordCount ?? null,
    headerText: img.debug?.structured?.header.text ?? null,
    rightText: img.debug?.structured?.rightColumn.text ?? null,
    rowSamples:
      img.debug?.structured?.rows.slice(0, 8).map((r) => ({
        index: r.index,
        yCenterPx: r.yCenterPx,
        band: r.band,
        crops: r.crops,
        dayText: r.dayText,
        monthText: r.monthText,
        weekdayText: r.weekdayText,
        scheduledText: r.scheduledText,
        parsedDate: r.parsedDate ?? null,
        parsedStart: r.parsedStart ?? null,
        parsedEnd: r.parsedEnd ?? null,
        skippedReason: r.skippedReason ?? null,
      })) ?? null,
    fallbackTextPreview: img.debug?.fallbackText
      ? img.debug.fallbackText.slice(0, 500)
      : null,
  }));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for environments without Clipboard API.
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) {
    throw new Error('Copy failed');
  }
}

export function ReviewClient({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<OcrResponse | null>(null);
  const [shifts, setShifts] = React.useState<EditableShift[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [copiedAt, setCopiedAt] = React.useState<number | null>(null);
  const [conflicts, setConflicts] = React.useState<PublishConflict[] | null>(
    null,
  );
  const [decisionsByDate, setDecisionsByDate] = React.useState<
    Record<string, PublishDecision['resolution']>
  >({});

  React.useEffect(() => {
    let cancelled = false;
    setError(null);

    async function load() {
      const raw = sessionStorage.getItem(`zsc_draft_${batchId}`);
      if (raw) {
        try {
          const parsedJson: unknown = JSON.parse(raw);
          const parsed = ocrResponseSchema.safeParse(parsedJson);
          if (parsed.success) {
            if (!cancelled) {
              setDraft(parsed.data);
              setShifts(flattenShifts(parsed.data));
            }
            return;
          }
        } catch {
          // fall through to server fetch
        }
      }

      const resp = await fetch(`/api/drafts/${encodeURIComponent(batchId)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      const json: unknown = await resp.json().catch(() => null);
      if (!resp.ok) {
        const msg =
          typeof json === 'object' &&
          json &&
          'error' in json &&
          typeof json.error === 'string'
            ? json.error
            : `Failed to load draft (${resp.status}).`;
        if (!cancelled) setError(msg);
        return;
      }

      const parsed = ocrResponseSchema.safeParse(json);
      if (!parsed.success) {
        if (!cancelled)
          setError('Draft data format is invalid. Please re-run OCR.');
        return;
      }

      sessionStorage.setItem(
        `zsc_draft_${batchId}`,
        JSON.stringify(parsed.data),
      );
      if (!cancelled) {
        setDraft(parsed.data);
        setShifts(flattenShifts(parsed.data));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  function updateShift(id: string, patch: Partial<EditableShift>) {
    setShifts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function removeShift(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
  }

  const validCount = React.useMemo(() => {
    let ok = 0;
    for (const s of shifts) {
      const parsed = draftShiftSchema.safeParse(s);
      if (parsed.success) ok += 1;
    }
    return ok;
  }, [shifts]);

  async function publish() {
    setError(null);
    if (!draft) return;

    // client-side validation before sending
    const validated: DraftShift[] = [];
    for (const s of shifts) {
      const parsed = draftShiftSchema.safeParse(s);
      if (!parsed.success) {
        setError(
          'One or more shifts are invalid. Please fix highlighted rows.',
        );
        return;
      }
      validated.push(parsed.data);
    }

    setIsPublishing(true);
    try {
      const decisions: PublishDecision[] = Object.entries(decisionsByDate).map(
        ([date, resolution]) => ({ date, resolution }),
      );

      const resp = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: draft.batchId,
          timezone: draft.timezone,
          shifts: validated,
          decisions: decisions.length > 0 ? decisions : undefined,
        }),
      });
      const json: unknown = await resp.json();
      if (!resp.ok) {
        if (resp.status === 409) {
          const parsed = publishConflictResponseSchema.safeParse(json);
          if (parsed.success) {
            setConflicts(parsed.data.conflicts);
            setDecisionsByDate((prev) => {
              const next = { ...prev };
              for (const c of parsed.data.conflicts) {
                if (!next[c.date]) next[c.date] = 'keep';
              }
              return next;
            });
            setError(
              'Some days already have published events. Choose how to resolve conflicts, then publish again.',
            );
            return;
          }
        }

        const msg =
          typeof json === 'object' &&
          json &&
          'error' in json &&
          typeof json.error === 'string'
            ? json.error
            : `Publish failed (${resp.status}).`;
        setError(msg);
        return;
      }

      sessionStorage.removeItem(`zsc_draft_${batchId}`);
      void fetch(`/api/drafts/${encodeURIComponent(batchId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      router.push('/schedule');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsPublishing(false);
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review OCR results</CardTitle>
          <CardDescription>Draft loading failed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="text-sm text-zinc-300 hover:text-zinc-50"
              href="/upload"
            >
              Back to upload
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review OCR results</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-300">
            Reading draft from session…
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Draft shifts</CardTitle>
          <CardDescription>
            Edit anything that OCR got wrong, then publish to the schedule
            store.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <details className="mt-2 rounded-lg border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-50">
              OCR debug details
            </summary>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-400">
                Copy the full debug payload to paste into an issue/message.
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const payload = JSON.stringify(
                    {
                      batchId: draft.batchId,
                      timezone: draft.timezone,
                      images: draft.images.map((img) => ({
                        filename: img.filename,
                        mode: img.mode,
                        debug: img.debug ?? null,
                      })),
                    },
                    null,
                    2,
                  );
                  await copyToClipboard(payload);
                  setCopiedAt(Date.now());
                }}
              >
                {copiedAt && Date.now() - copiedAt < 2500
                  ? 'Copied'
                  : 'Copy debug JSON'}
              </Button>
            </div>
            <div className="mt-3 grid gap-3">
              {summarizeImageDebug(draft).map((img) => (
                <div
                  key={img.filename}
                  className="rounded-md border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-100">
                      {img.filename}
                    </div>
                    <div className="text-xs text-zinc-400">
                      mode={img.mode} shifts={img.shiftCount}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-400">
                    structured rowsDetected={String(img.structuredRowsDetected)}{' '}
                    method=
                    {String(img.detectionMethod)} words={String(img.wordCount)}
                  </div>
                  {img.headerText ? (
                    <div className="mt-2 text-xs text-zinc-400">
                      header:{' '}
                      <span className="text-zinc-300">{img.headerText}</span>
                    </div>
                  ) : null}
                  {img.rightText ? (
                    <div className="mt-1 text-xs text-zinc-400">
                      rightCol:{' '}
                      <span className="text-zinc-300">{img.rightText}</span>
                    </div>
                  ) : null}
                  {img.rowSamples ? (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-[11px] leading-4 text-zinc-200">
                      {JSON.stringify(img.rowSamples, null, 2)}
                    </pre>
                  ) : null}
                  {img.fallbackTextPreview ? (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-[11px] leading-4 text-zinc-200">
                      {img.fallbackTextPreview}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </details>

          {conflicts && conflicts.length > 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-zinc-50">
                Conflicts detected
              </div>
              <div className="mt-1 text-sm text-zinc-300">
                For each date below, choose what to do with existing events.
              </div>
              <div className="mt-4 grid gap-3">
                {conflicts.map((c) => {
                  const existingSummary = c.existing
                    .map((e) => `${e.startTime}–${e.endTime}`)
                    .join(', ');
                  const proposedSummary = c.proposed
                    .map((e) => `${e.startTime}–${e.endTime}`)
                    .join(', ');
                  const value = decisionsByDate[c.date] ?? 'keep';

                  return (
                    <div
                      key={c.date}
                      className="rounded-md border border-white/10 bg-white/[0.03] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-medium text-zinc-100">
                          {c.date}
                        </div>
                        <select
                          className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-50 outline-none focus:border-purple-400/25 focus:ring-2 focus:ring-purple-400/10"
                          value={value}
                          onChange={(e) => {
                            const resolution = e.target
                              .value as PublishDecision['resolution'];
                            setDecisionsByDate((prev) => ({
                              ...prev,
                              [c.date]: resolution,
                            }));
                          }}
                        >
                          <option value="keep">
                            Keep existing (ignore proposed)
                          </option>
                          <option value="replace">
                            Replace existing with proposed
                          </option>
                          <option value="add">
                            Add proposed alongside existing
                          </option>
                        </select>
                      </div>
                      <div className="mt-2 text-xs text-zinc-400">
                        Existing:{' '}
                        <span className="text-zinc-300">{existingSummary}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Proposed:{' '}
                        <span className="text-zinc-300">{proposedSummary}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <div>
              Batch: <span className="text-zinc-100">{draft.batchId}</span>
            </div>
            <div>
              Timezone: <span className="text-zinc-100">{draft.timezone}</span>
            </div>
            <div>
              Valid rows:{' '}
              <span className="text-zinc-100">
                {validCount}/{shifts.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-200">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Start</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const rowValid = draftShiftSchema.safeParse(s).success;
                  const modeClass =
                    s.imageMode === 'structured'
                      ? 'border-purple-400/25 bg-purple-500/10 text-purple-100'
                      : 'border-amber-400/25 bg-amber-500/10 text-amber-100';
                  return (
                    <tr key={s.id} className="border-t border-white/10">
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={s.date}
                          onChange={(e) =>
                            updateShift(s.id, { date: e.target.value })
                          }
                          className={rowValid ? '' : 'border-red-500/30'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="time"
                          value={s.startTime}
                          onChange={(e) =>
                            updateShift(s.id, { startTime: e.target.value })
                          }
                          className={rowValid ? '' : 'border-red-500/30'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="time"
                          value={s.endTime}
                          onChange={(e) =>
                            updateShift(s.id, { endTime: e.target.value })
                          }
                          className={rowValid ? '' : 'border-red-500/30'}
                        />
                      </td>
                      <td className="px-3 py-2 text-zinc-200">
                        {Math.round(clamp01(s.confidence) * 100)}%
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span>{s.imageFilename}</span>
                          <span
                            className={[
                              'inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium',
                              modeClass,
                            ].join(' ')}
                            title={
                              s.imageMode === 'structured'
                                ? 'Structured (cropped) OCR'
                                : 'Fallback (whole-image) OCR'
                            }
                          >
                            {s.imageMode}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-zinc-300 hover:text-zinc-50"
                          onClick={() => removeShift(s.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={publish}
              disabled={isPublishing || shifts.length === 0}
            >
              {isPublishing ? 'Publishing…' : 'Publish'}
            </Button>
            <Link
              className="text-sm text-zinc-300 hover:text-zinc-50"
              href="/upload"
            >
              Back
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
