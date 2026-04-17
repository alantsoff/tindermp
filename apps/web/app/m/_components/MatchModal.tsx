'use client';

type Props = {
  open: boolean;
  partnerName: string;
  onOpenChat: () => void;
  onContinue: () => void;
};

export function MatchModal({ open, partnerName, onOpenChat, onContinue }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-pink-500 to-violet-500 p-6 text-white">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
        <div className="mb-3 text-4xl font-semibold">It&apos;s a match!</div>
        <p className="mb-8 text-white/90">У вас взаимный лайк с {partnerName}</p>
        <button
          type="button"
          className="mb-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
          onClick={onOpenChat}
        >
          Написать сообщение
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-white/70 px-4 py-3 text-sm font-semibold"
          onClick={onContinue}
        >
          Продолжить свайпать
        </button>
      </div>
    </div>
  );
}
