'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';

export function HeaderActions({ authed }: { authed: boolean }) {
  if (!authed) {
    return (
      <Link href="/login">
        <Button variant="secondary" size="sm" className="whitespace-nowrap">
          Log in
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex flex-nowrap items-center gap-3">
      <form method="POST" action="/api/auth/logout">
        <Button
          variant="secondary"
          size="sm"
          type="submit"
          className="whitespace-nowrap"
        >
          Log out
        </Button>
      </form>
      <Image
        src="/bandit.jpg"
        alt="Profile"
        width={40}
        height={40}
        className="h-8 w-8 rounded-full border border-white/10 object-cover sm:h-10 sm:w-10"
      />
    </div>
  );
}
