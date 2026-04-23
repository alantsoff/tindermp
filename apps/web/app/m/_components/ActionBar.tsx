'use client';

import { Heart, RotateCcw, X } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { hapticImpact } from '../_lib/telegram';

type Props = {
  onPass?: () => void;
  onLike?: () => void;
  onUndo?: () => void;
};

type ActionButtonProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tintVar: string;
  size: 'sm' | 'lg';
  ariaLabel: string;
  onClick?: () => void;
};

function ActionButton({ icon: Icon, tintVar, size, ariaLabel, onClick }: ActionButtonProps) {
  const active = Boolean(onClick);
  const dimension = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  const iconSize = size === 'lg' ? 28 : 22;

  return (
    <button
      type="button"
      onClick={() => {
        if (!active || !onClick) return;
        hapticImpact(size === 'sm' ? 'light' : 'medium');
        onClick();
      }}
      disabled={!active}
      aria-label={ariaLabel}
      className={[
        'glass glass-edge relative inline-flex items-center justify-center rounded-full',
        dimension,
        'transition-transform active:scale-[0.9]',
        active ? '' : 'pointer-events-none opacity-45',
      ].join(' ')}
      style={{
        color: `rgb(var(--${tintVar}))`,
        transitionDuration: 'var(--dur-base)',
        transitionTimingFunction: 'var(--ease-ios)',
        transitionProperty: 'transform, background-color, opacity',
      }}
    >
      <Icon width={iconSize} height={iconSize} strokeWidth={2.4} aria-hidden />
    </button>
  );
}

export function ActionBar({ onPass, onLike, onUndo }: Props) {
  return (
    <div
      className="mt-6 flex items-center justify-center gap-4"
      style={{
        marginBottom:
          'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 92px)',
      }}
    >
      <ActionButton
        icon={X}
        tintVar="ios-red"
        size="lg"
        ariaLabel="Пропустить"
        onClick={onPass}
      />
      <ActionButton
        icon={RotateCcw}
        tintVar="ios-yellow"
        size="sm"
        ariaLabel="Отменить"
        onClick={onUndo}
      />
      <ActionButton
        icon={Heart}
        tintVar="ios-green"
        size="lg"
        ariaLabel="Лайк"
        onClick={onLike}
      />
    </div>
  );
}
