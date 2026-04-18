import type { InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: ReactNode;
}

export function Input({ prefix, className, ...rest }: Props) {
  return (
    <div className={clsx(
      'flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2',
      'focus-within:border-white/30',
      className
    )}>
      {prefix && <span className="mr-2 text-white/60">{prefix}</span>}
      <input
        className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none"
        {...rest}
      />
    </div>
  );
}
