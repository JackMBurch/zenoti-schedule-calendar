import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { getDefaultTimezone } from '@/lib/env';
import { scheduleStore } from '@/lib/schedule/store-file';

import { CalendarEditorClient } from './CalendarEditorClient';

export default async function CalendarPage() {
  const events = await scheduleStore.listEvents();

  return (
    <div className="grid gap-6 pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Calendar editor</CardTitle>
          <CardDescription>
            Correct mistakes, add days, or remove events. Changes affect the
            iCal feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <CalendarEditorClient
            initialEvents={events}
            defaultTimezone={getDefaultTimezone()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
