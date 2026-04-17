'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ChatBubble } from '../../_components/ChatBubble';
import { hideMainButton, showMainButton } from '../../_lib/telegram';
import { useMatchMe, useMessages, useSendMessage } from '../../_lib/queries';

export default function MatchChatPage() {
  const params = useParams<{ pairId: string }>();
  const pairId = params?.pairId ?? '';
  const [text, setText] = useState('');
  const { data: me } = useMatchMe();
  const { data: messages, isLoading } = useMessages(pairId);
  const sendMessage = useSendMessage(pairId);
  const profileId = me?.profile?.id ?? null;
  const hasText = useMemo(() => text.trim().length > 0, [text]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    await sendMessage.mutateAsync(body);
    setText('');
    hideMainButton();
  };

  return (
    <div className="flex min-h-[80vh] flex-col">
      <h1 className="mb-3 text-xl font-semibold">Чат</h1>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="text-sm text-zinc-400">Загружаем сообщения…</div> : null}
        {messages?.map((msg) => (
          <ChatBubble key={msg.id} message={msg} isMine={profileId === msg.senderProfileId} />
        ))}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <input
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          value={text}
          placeholder="Сообщение"
          onFocus={() => showMainButton('Отправить')}
          onBlur={() => {
            if (!hasText) hideMainButton();
          }}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          disabled={!hasText || sendMessage.isPending}
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
