import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

import { HeaderActions } from '@/app/HeaderActions';
import { isAuthed } from '@/lib/auth/isAuthed';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Zenoti Schedule Calendar',
  description:
    'OCR Zenoti schedule screenshots into a subscribable calendar feed.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authed = await isAuthed();

  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <div className="min-h-full">
          <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-7">
            <div className="flex items-center gap-4">
              <Link href="/" className="shrink-0">
                <Image
                  src="/zenoti_logo_rounded.png"
                  alt="Zenoti Schedule Calendar"
                  width={44}
                  height={44}
                  priority
                  className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5"
                />
              </Link>
              <div className="leading-tight">
                <div className="text-base font-semibold tracking-tight text-zinc-50">
                  Zenoti Schedule Calendar
                </div>
                <div className="text-sm text-zinc-400">
                  OCR → review → publish → iCal feed
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HeaderActions authed={authed} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-6 pb-16 -mt-2">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
