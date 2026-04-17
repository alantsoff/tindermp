'use client';

import type { MatchMessage } from '../_lib/api';

export function ChatBubble({ message, isMine }: { message: MatchMessage; isMine: boolean }) {
  return (
    <div className={`mb-2 flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isMine ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-100'
        }`}
      >
        {message.body}
      </div>
    </div>
  );
}
