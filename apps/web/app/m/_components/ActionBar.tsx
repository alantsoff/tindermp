'use client';

import { Heart, RotateCcw, X } from 'lucide-react';

type Props = {
  onPass: () => void;
  onLike: () => void;
  onUndo: () => void;
  disabled?: boolean;
};

export function ActionBar({ onPass, onLike, onUndo, disabled }: Props) {
  return (
    <div className="mt-4 flex items-center justify-center gap-4">
      <button
        type="button"
        className="rounded-full bg-zinc-800 p-3 text-red-300 disabled:opacity-50"
        onClick={onPass}
        disabled={disabled}
      >
        <X size={24} />
      </button>
      <button
        type="button"
        className="rounded-full bg-zinc-800 p-3 text-zinc-300 disabled:opacity-50"
        onClick={onUndo}
        disabled={disabled}
      >
        <RotateCcw size={24} />
      </button>
      <button
        type="button"
        className="rounded-full bg-zinc-800 p-3 text-emerald-300 disabled:opacity-50"
        onClick={onLike}
        disabled={disabled}
      >
        <Heart size={24} />
      </button>
    </div>
  );
}
