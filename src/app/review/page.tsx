import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';

import { ReviewClient } from './ReviewClient';

type ReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = (await searchParams) ?? {};
  const batch = getSingleParam(params.batch);

  return (
    <div className="grid gap-6 pt-6">
      {batch ? (
        <ReviewClient batchId={batch} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Review OCR results</CardTitle>
            <CardDescription>No draft batch selected.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-zinc-300">
              Go back to upload and run OCR first.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
