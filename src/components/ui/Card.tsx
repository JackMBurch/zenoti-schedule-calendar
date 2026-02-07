import * as React from 'react';

import { cn } from '@/lib/utils';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.03]',
        className,
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;
export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div className={cn('px-5 pt-5', className)} {...props} />;
}

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;
export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h2
      className={cn('text-base font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;
export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p className={cn('mt-1 text-sm text-zinc-300', className)} {...props} />
  );
}

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;
export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}
