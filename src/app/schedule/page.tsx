import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { SubscribeToCalendarButton } from '@/components/SubscribeToCalendarButton';
import { scheduleStore } from '@/lib/schedule/store-file';

function getFeedUrl(): string | null {
  const token = process.env.FEED_TOKEN;
  if (!token || token.trim().length === 0) return null;
  return `/api/feed/${encodeURIComponent(token)}/ics`;
}

export default async function SchedulePage() {
  const events = await scheduleStore.listEvents();
  const feedUrl = getFeedUrl();

  return (
    <div className="grid gap-6 pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Published schedule</CardTitle>
          <CardDescription>
            This is what your iCal feed will publish.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-4">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-50">
                iCal feed
              </div>
              {feedUrl ? (
                <div className="mt-3">
                  <SubscribeToCalendarButton feedPath={feedUrl} />
                </div>
              ) : (
                <div className="mt-1 text-sm text-zinc-300">
                  Set{' '}
                  <span className="font-mono text-zinc-100">FEED_TOKEN</span> in{' '}
                  <span className="font-mono text-zinc-100">.env</span> to
                  enable the feed.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/10">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2">
                <div className="text-sm font-medium text-zinc-200">Events</div>
                <div className="text-xs text-zinc-400">
                  {events.length} total
                </div>
              </div>
              <div className="p-4">
                {events.length === 0 ? (
                  <div className="text-sm text-zinc-300">
                    No published events yet. Go to Upload to OCR screenshots.
                  </div>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {events
                      .slice()
                      .sort((a, b) =>
                        `${a.date}T${a.startTime}`.localeCompare(
                          `${b.date}T${b.startTime}`,
                        ),
                      )
                      .map((e) => (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <div className="font-mono text-zinc-100">
                            {e.date} {e.startTime}–{e.endTime}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {e.timezone}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
