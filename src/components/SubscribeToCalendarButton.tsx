'use client';

import * as React from 'react';

import { Button } from '@/components/ui/Button';

type SubscribeToCalendarButtonProps = {
  feedPath: string | null;
  className?: string;
};

function buildAbsoluteUrl(feedPath: string): string {
  return new URL(feedPath, window.location.origin).toString();
}

function toWebcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, 'webcal://');
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('Copy failed');
}

export function SubscribeToCalendarButton({
  feedPath,
  className,
}: SubscribeToCalendarButtonProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const subscribe = React.useCallback(() => {
    if (!feedPath) return;
    const httpUrl = buildAbsoluteUrl(feedPath);
    const webcalUrl = toWebcalUrl(httpUrl);
    window.location.href = webcalUrl;
  }, [feedPath]);

  const copyFeedUrl = React.useCallback(async () => {
    if (!feedPath) return;
    const httpUrl = buildAbsoluteUrl(feedPath);
    await copyToClipboard(httpUrl);
    setCopied(true);
  }, [feedPath]);

  return (
    <div className={['flex flex-wrap items-center gap-3', className].join(' ')}>
      <Button
        onClick={subscribe}
        disabled={!feedPath}
        title={
          feedPath
            ? 'Opens your calendar app to subscribe.'
            : 'Set FEED_TOKEN to enable subscribing.'
        }
      >
        Subscribe to calendar
      </Button>
      <Button
        variant="secondary"
        onClick={() => void copyFeedUrl()}
        disabled={!feedPath}
        title={
          feedPath
            ? 'Copies the https feed URL.'
            : 'Set FEED_TOKEN to enable subscribing.'
        }
      >
        {copied ? 'Copied' : 'Copy feed URL'}
      </Button>
    </div>
  );
}
