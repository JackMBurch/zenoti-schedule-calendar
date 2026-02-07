import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { getDefaultTimezone } from '@/lib/env';

import { UploadForm } from './UploadForm';

export default function UploadPage() {
  return (
    <div className="grid gap-6 pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload screenshots</CardTitle>
          <CardDescription>
            Upload multiple Zenoti schedule screenshots; we’ll extract your
            shifts into a draft schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <UploadForm defaultTimezone={getDefaultTimezone()} />
        </CardContent>
      </Card>
    </div>
  );
}
