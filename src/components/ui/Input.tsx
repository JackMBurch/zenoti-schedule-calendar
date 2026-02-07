import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  const base =
    'h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-50 placeholder:text-zinc-400 shadow-sm outline-none transition-colors focus:border-purple-400/25 focus:ring-2 focus:ring-purple-400/10';

  const file =
    'h-10 w-full cursor-pointer rounded-md border border-white/10 bg-white/5 pr-3 text-sm text-zinc-200 shadow-sm outline-none transition-colors focus:border-purple-400/25 focus:ring-2 focus:ring-purple-400/10 file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-purple-600 file:px-4 file:text-sm file:font-medium file:text-white hover:file:bg-purple-500';

  return (
    <input
      type={type}
      className={cn(type === 'file' ? file : base, className)}
      {...props}
    />
  );
}
