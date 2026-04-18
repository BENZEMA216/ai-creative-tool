import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  loading,
  fullWidth,
  className,
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'rounded-xl border px-5 py-3 font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'hover:scale-[1.02] active:scale-[0.98]',
        variant === 'primary' &&
          'border-white/20 bg-white/10 text-white hover:bg-white/15',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-white/70 hover:text-white',
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? '处理中…' : children}
    </button>
  );
}
