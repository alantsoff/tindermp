'use client';

import type { ReactNode } from 'react';

type ChipProps = {
  label: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  leadingIcon?: ReactNode;
};

export function Chip({
  label,
  selected,
  onToggle,
  disabled = false,
  leadingIcon,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'inline-flex min-h-[38px] items-center justify-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold',
        'transition-[transform,background-color,color,border-color,box-shadow]',
        'active:scale-[0.96]',
        selected
          ? 'border border-transparent text-white shadow-[0_6px_18px_-8px_rgb(var(--ios-tint)/0.55)]'
          : 'text-[rgb(var(--ios-label))]',
        disabled ? 'cursor-not-allowed opacity-40 active:scale-100' : '',
      ].join(' ')}
      data-smooth=""
      style={
        selected
          ? {
              background: 'rgb(var(--ios-tint))',
              transitionDuration: 'var(--dur-base)',
              transitionTimingFunction: 'var(--ease-ios)',
            }
          : {
              background: 'rgb(var(--ios-bg-elevated))',
              border: '1px solid rgb(var(--hairline-strong))',
              transitionDuration: 'var(--dur-base)',
              transitionTimingFunction: 'var(--ease-ios)',
            }
      }
    >
      {leadingIcon ? (
        <span
          className={
            selected
              ? 'text-white/90'
              : 'text-[rgb(var(--ios-label-secondary)/0.8)]'
          }
        >
          {leadingIcon}
        </span>
      ) : null}
      <span className="tracking-tight">{label}</span>
    </button>
  );
}
