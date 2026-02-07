import type { ScheduleEvent } from '@/lib/schedule/types';

export type UpsertConflictResolution = 'replace' | 'keep' | 'add';

export type UpsertDecision = {
  date: ScheduleEvent['date'];
  resolution: UpsertConflictResolution;
};

export interface ScheduleStore {
  listEvents(): Promise<ScheduleEvent[]>;
  setEvents(events: ScheduleEvent[]): Promise<void>;
}
