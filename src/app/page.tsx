import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SubscribeToCalendarButton } from '@/components/SubscribeToCalendarButton';
import { isAuthed } from '@/lib/auth/isAuthed';

function getFeedUrl(): string | null {
  const token = process.env.FEED_TOKEN;
  if (!token || token.trim().length === 0) return null;
  return `/api/feed/${encodeURIComponent(token)}/ics`;
}

export default async function Home() {
  const feedUrl = getFeedUrl();
  const authed = await isAuthed();

  return (
    <div className="grid gap-8">
      <section className="pt-4">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Turn Zenoti schedule screenshots into a live calendar feed.
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-zinc-300 sm:text-base">
          Upload screenshots, OCR parses your shifts, you review/edit for
          accuracy, then we publish a subscribable iCal feed for Google
          Calendar, Apple Calendar, and more.
        </p>
      </section>

      {!authed ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-50">
            Login required
          </div>
          <div className="mt-1 text-sm text-zinc-300">
            You need to log in with the master password to upload screenshots
            and publish.
          </div>
          <div className="mt-4">
            <Link href="/login">
              <Button>Go to login</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {authed ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-zinc-50">Upload screenshots</CardTitle>
              <CardDescription>
                Read your Zenoti weekly schedule screenshots with OCR.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Link href="/upload">
                <Button>Upload screenshots</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-zinc-50">Readonly iCal feed</CardTitle>
              <CardDescription>
                Subscribe once; your calendar stays updated.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-3">
                <SubscribeToCalendarButton feedPath={feedUrl} />
                {!feedUrl ? (
                  <div className="text-xs text-zinc-400">
                    Set{' '}
                    <span className="font-mono text-zinc-100">FEED_TOKEN</span>{' '}
                    to enable subscribing.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-zinc-50">Calendar editor</CardTitle>
              <CardDescription>
                View and manually fix published days and times.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Link href="/calendar">
                <Button variant="secondary">Open editor</Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
