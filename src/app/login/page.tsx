import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const error = getSingleParam(params.error);

  const errorMessage =
    error === '1'
      ? 'Incorrect password.'
      : error === 'server'
        ? 'Server is missing required environment variables.'
        : undefined;

  return (
    <div className="mx-auto grid max-w-md gap-6 pt-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
          Login
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          Enter the master password to access uploads and publishing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Master password</CardTitle>
          <CardDescription>
            This app uses a single shared password (no user accounts).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="POST" action="/api/auth/login" className="grid gap-3">
            <div className="grid gap-1.5">
              <label
                className="text-xs font-medium text-zinc-400"
                htmlFor="password"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              {errorMessage ? (
                <div className="text-sm text-red-200">{errorMessage}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Login</Button>
              <Link
                className="text-sm text-zinc-300 hover:text-zinc-50"
                href="/"
              >
                Back
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
