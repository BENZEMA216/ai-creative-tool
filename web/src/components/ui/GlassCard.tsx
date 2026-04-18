import type { HTMLAttributes, PropsWithChildren } from 'react';
import { clsx } from 'clsx';

interface Props extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function GlassCard({ children, className, ...rest }: PropsWithChildren<Props>) {
  return (
    <div
      className={clsx(
        'glass rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.25)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
