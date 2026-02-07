'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';

export function HeaderActions({ authed }: { authed: boolean }) {
  if (!authed) {
    return (
      <Link href="/login">
        <Button variant="secondary" size="sm">
          Log in
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/">
        <Button variant="secondary" size="sm">
          Home
        </Button>
      </Link>
      <form method="POST" action="/api/auth/logout">
        <Button variant="secondary" size="sm" type="submit">
          Log out
        </Button>
      </form>
      <Image
        src="/bandit.jpg"
        alt="Profile"
        width={40}
        height={40}
        className="h-10 w-10 rounded-full border border-white/10 object-cover"
      />
    </div>
  );
}
