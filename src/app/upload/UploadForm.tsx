'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { ocrResponseSchema, type OcrResponse } from '@/lib/ocr/types';

type UploadFormProps = {
  defaultTimezone: string;
};

const commonTimezones = [
  'UTC',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function getTimezoneOptions(defaultTimezone: string): string[] {
  const set = new Set<string>(commonTimezones);
  set.add(defaultTimezone);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function UploadForm({ defaultTimezone }: UploadFormProps) {
  const router = useRouter();
  const timezoneOptions = React.useMemo(
    () => getTimezoneOptions(defaultTimezone),
    [defaultTimezone],
  );
  const [timezone, setTimezone] = React.useState(defaultTimezone);
  const [files, setFiles] = React.useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (files.length === 0) {
      setError('Please choose at least one screenshot to upload.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set('timezone', timezone);
      for (const file of files) formData.append('screenshots', file);

      const resp = await fetch('/api/ocr', { method: 'POST', body: formData });
      const json: unknown = await resp.json();

      if (!resp.ok) {
        const msg =
          typeof json === 'object' &&
          json &&
          'error' in json &&
          typeof json.error === 'string'
            ? json.error
            : `Upload failed (${resp.status}).`;
        setError(msg);
        return;
      }

      const parsed = ocrResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError('OCR succeeded but returned an unexpected response shape.');
        return;
      }

      const data: OcrResponse = parsed.data;
      sessionStorage.setItem(`zsc_draft_${data.batchId}`, JSON.stringify(data));
      router.push(`/review?batch=${encodeURIComponent(data.batchId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <details className="rounded-lg border border-white/10 bg-white/[0.03] px-3 pb-2 pt-1.5">
        <summary className="cursor-pointer select-none text-sm font-medium text-zinc-300">
          Advanced settings
          <span className="ml-2 text-xs font-normal text-zinc-400">
            (timezone)
          </span>
        </summary>
        <div className="mt-3 grid gap-1.5">
          <label
            className="text-xs font-medium text-zinc-400"
            htmlFor="timezone"
          >
            Timezone (IANA)
          </label>
          <div className="relative">
            <select
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-10 w-full appearance-none rounded-md border border-white/10 bg-white/5 px-3 pr-10 text-sm text-zinc-50 outline-none transition-colors focus:border-purple-400/25 focus:ring-2 focus:ring-purple-400/10"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            Parsed times will be interpreted in this timezone.
          </div>
        </div>
      </details>

      <div className="grid gap-1.5">
        <label
          className="text-xs font-medium text-zinc-400"
          htmlFor="screenshots"
        >
          Screenshots
        </label>
        <Input
          id="screenshots"
          name="screenshots"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const list = e.currentTarget.files;
            setFiles(list ? Array.from(list) : []);
          }}
        />
        <div className="text-xs text-zinc-400">
          Upload multiple screenshots; we’ll extract and merge shifts into one
          draft.
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Processing…' : 'Create draft schedule'}
        </Button>
        <div
          className={cn(
            'text-xs text-zinc-400',
            files.length === 0 ? 'opacity-70' : 'opacity-100',
          )}
        >
          {files.length} file{files.length === 1 ? '' : 's'} selected
        </div>
      </div>
    </form>
  );
}
