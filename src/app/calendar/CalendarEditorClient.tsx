'use client';

import * as React from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { scheduleEventSchema, type ScheduleEvent } from '@/lib/schedule/types';

type EditableEvent = ScheduleEvent;

type CalendarEditorClientProps = {
  initialEvents: ScheduleEvent[];
  defaultTimezone: string;
};

const putResponseSchema = z.object({
  events: z.array(scheduleEventSchema),
});

function createId(): string {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortKey(e: EditableEvent): string {
  return `${e.date}T${e.startTime}`;
}

function getCurrentMonthLocal(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function addMonths(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return getCurrentMonthLocal();
  }
  const base = new Date(y, m - 1, 1);
  base.setMonth(base.getMonth() + delta);
  const yyyy = String(base.getFullYear());
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function formatMonthLong(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return month;
  }
  const dt = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function CalendarEditorClient({
  initialEvents,
  defaultTimezone,
}: CalendarEditorClientProps) {
  const [events, setEvents] = React.useState<EditableEvent[]>(() =>
    [...initialEvents].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [month, setMonth] = React.useState<string>(() =>
    getCurrentMonthLocal(),
  );

  const availableMonths = React.useMemo(() => {
    const months = new Set<string>();
    for (const e of events) months.add(e.date.slice(0, 7));
    months.add(getCurrentMonthLocal());
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [events]);

  React.useEffect(() => {
    if (!availableMonths.includes(month)) {
      setMonth(getCurrentMonthLocal());
    }
  }, [availableMonths, month]);

  const invalidIds = React.useMemo(() => {
    const out = new Set<string>();
    for (const e of events) {
      if (!scheduleEventSchema.safeParse(e).success) out.add(e.id);
    }
    return out;
  }, [events]);

  const visibleEvents = React.useMemo(() => {
    return events
      .filter((e) => e.date.startsWith(`${month}-`))
      .slice()
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [events, month]);

  const workingDaysCount = React.useMemo(() => {
    const dates = new Set<string>();
    for (const e of visibleEvents) dates.add(e.date);
    return dates.size;
  }, [visibleEvents]);

  function updateEvent(id: string, patch: Partial<EditableEvent>) {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }

  function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function addEvent() {
    const nowIso = new Date().toISOString();
    const currentMonth = getCurrentMonthLocal();
    const date =
      month === currentMonth
        ? new Date().toISOString().slice(0, 10)
        : `${month}-01`;
    const next: EditableEvent = {
      id: createId(),
      date,
      startTime: '09:00',
      endTime: '17:00',
      timezone: defaultTimezone,
      source: 'manual',
      updatedAt: nowIso,
    };
    setEvents((prev) =>
      [...prev, next].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    );
  }

  async function save() {
    setError(null);
    if (invalidIds.size > 0) {
      setError('Fix invalid rows before saving.');
      return;
    }
    setIsSaving(true);
    try {
      const resp = await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          events: events.map((e) => ({
            id: e.id,
            date: e.date,
            startTime: e.startTime,
            endTime: e.endTime,
            timezone: e.timezone,
            source: e.source,
          })),
        }),
      });
      const json: unknown = await resp.json();
      if (!resp.ok) {
        const msg =
          typeof json === 'object' &&
          json &&
          'error' in json &&
          typeof json.error === 'string'
            ? json.error
            : `Save failed (${resp.status}).`;
        setError(msg);
        return;
      }

      const parsedResponse = putResponseSchema.safeParse(json);
      if (parsedResponse.success) {
        setEvents(
          parsedResponse.data.events
            .slice()
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
        );
      }

      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-300">
          Showing {workingDaysCount} working day
          {workingDaysCount === 1 ? '' : 's'} in{' '}
          <span className="text-zinc-100">{formatMonthLong(month)}</span>
          <span className="ml-2 text-zinc-400">({events.length} total)</span>
          {invalidIds.size > 0 ? (
            <span className="ml-2 text-red-200">
              ({invalidIds.size} invalid)
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            {formatMonthLong(addMonths(month, 1))}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            {formatMonthLong(addMonths(month, -1))}
          </Button>
          <Button variant="secondary" onClick={addEvent}>
            Add day
          </Button>
          <Button onClick={() => void save()} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
          {savedAt ? <div className="text-xs text-zinc-400">Saved</div> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-[880px] w-full text-left text-sm">
          <thead className="bg-white/5 text-zinc-200">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">End</th>
              <th className="w-[180px] px-3 py-2 font-medium">Timezone</th>
              <th className="w-[120px] px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((e) => {
              const invalid = invalidIds.has(e.id);
              return (
                <tr key={e.id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <Input
                      type="date"
                      value={e.date}
                      onChange={(ev) =>
                        updateEvent(e.id, { date: ev.target.value })
                      }
                      className={cn(invalid ? 'border-red-500/30' : '')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="time"
                      value={e.startTime}
                      onChange={(ev) =>
                        updateEvent(e.id, { startTime: ev.target.value })
                      }
                      className={cn(invalid ? 'border-red-500/30' : '')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="time"
                      value={e.endTime}
                      onChange={(ev) =>
                        updateEvent(e.id, { endTime: ev.target.value })
                      }
                      className={cn(invalid ? 'border-red-500/30' : '')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={e.timezone}
                      onChange={(ev) =>
                        updateEvent(e.id, { timezone: ev.target.value })
                      }
                      spellCheck={false}
                      placeholder="America/New_York"
                      className={cn('h-9', invalid ? 'border-red-500/30' : '')}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-400">
                    {e.source}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-zinc-300 hover:text-zinc-50"
                      onClick={() => removeEvent(e.id)}
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
    </div>
  );
}
