'use client';

import type { MatchMessage } from '../_lib/api';

export function ChatBubble({
  message,
  isMine,
}: {
  message: MatchMessage;
  isMine: boolean;
}) {
  if (message.systemGenerated) {
    return (
      <div className="my-3 flex justify-center">
        <div className="glass-ultra-thin rounded-full border border-[rgb(var(--hairline))] px-3 py-1 text-[12px] text-[rgb(var(--ios-label-secondary)/0.8)]">
          {message.body}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-1.5 flex ${isMine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={[
          'max-w-[78%] px-3.5 py-2 text-[15px] leading-snug',
          isMine
            ? 'rounded-[20px] rounded-br-md text-white'
            : 'rounded-[20px] rounded-bl-md bg-[rgb(var(--ios-bg-elevated))] text-[rgb(var(--ios-label))] ring-1 ring-[rgb(var(--hairline))]',
        ].join(' ')}
        style={
          isMine
            ? {
                background:
                  'linear-gradient(135deg, rgb(var(--ios-tint)), rgb(var(--ios-purple)))',
                boxShadow: '0 6px 18px -10px rgb(var(--ios-tint) / 0.5)',
              }
            : undefined
        }
      >
        {message.body}
      </div>
    </div>
  );
}
