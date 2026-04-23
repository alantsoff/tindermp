'use client';

import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { hapticNotification } from '../_lib/telegram';

type Props = {
  open: boolean;
  partnerName: string;
  onOpenChat: () => void;
  onContinue: () => void;
};

export function MatchModal({ open, partnerName, onOpenChat, onContinue }: Props) {
  useEffect(() => {
    if (!open) return;
    hapticNotification('success');
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onContinue}
        className="animate-backdrop-in absolute inset-0 bg-black/40 backdrop-blur-xl"
      />

      {/* Liquid Glass sheet */}
      <div
        className="glass glass-edge animate-pop-in relative w-full max-w-[430px] overflow-hidden rounded-[28px] p-6 text-center"
        style={{
          backgroundImage:
            'radial-gradient(120% 140% at 50% 0%, rgb(var(--ios-pink)/0.35), transparent 60%),' +
            'radial-gradient(120% 120% at 50% 110%, rgb(var(--ios-indigo)/0.35), transparent 60%)',
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--ios-pink)), rgb(var(--ios-indigo)))',
            boxShadow: '0 14px 40px -12px rgb(var(--ios-pink) / 0.6)',
          }}
        >
          <Sparkles size={30} className="text-white" strokeWidth={2.4} />
        </div>
        <h2 className="ios-title-large mb-2 tracking-tight">It’s a match</h2>
        <p className="mb-6 text-[15px] text-[rgb(var(--ios-label-secondary)/0.9)]">
          У вас взаимный лайк с {partnerName}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            className="ios-btn-primary w-full"
            onClick={onOpenChat}
          >
            Написать сообщение
          </button>
          <button
            type="button"
            className="ios-btn-plain w-full"
            onClick={onContinue}
          >
            Продолжить свайпать
          </button>
        </div>
      </div>
    </div>
  );
}
