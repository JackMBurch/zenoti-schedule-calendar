import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = {
  default:
    'bg-purple-600 text-white hover:bg-purple-500 border border-purple-500/60 hover:border-purple-400/70',
  secondary:
    'bg-white/5 text-zinc-50 hover:bg-white/10 border border-white/10 hover:border-white/15',
  ghost: 'bg-transparent hover:bg-white/5 text-zinc-50',
  danger:
    'bg-red-500/15 text-red-100 hover:bg-red-500/25 border border-red-500/25 hover:border-red-400/35',
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = 'default',
  size = 'md',
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/18 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}
