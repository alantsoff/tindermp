'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Send } from 'lucide-react';
import { Avatar } from '../../_components/Avatar';
import { ChatBubble } from '../../_components/ChatBubble';
import { ProfileDetailModal } from '../../_components/ProfileDetailModal';
import {
  useMatchPartner,
  useMarkPairRead,
  useMatchMe,
  useMatches,
  useMessages,
  useSendMessage,
} from '../../_lib/queries';

export default function MatchChatPage() {
  const params = useParams<{ pairId: string }>();
  const router = useRouter();
  const pairId = params?.pairId ?? '';
  const [text, setText] = useState('');
  const { data: me } = useMatchMe();
  const { data: pairs } = useMatches();
  const { data: partnerProfile } = useMatchPartner(pairId, Boolean(pairId));
  const { data: messages, isLoading } = useMessages(pairId);
  const sendMessage = useSendMessage(pairId);
  const markRead = useMarkPairRead(pairId);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileId = me?.profile?.id ?? null;
  const activePair = useMemo(
    () => (pairs ?? []).find((pair) => pair.id === pairId) ?? null,
    [pairs, pairId],
  );
  const partner = activePair?.partner ?? null;
  const partnerId = partner?.id ?? null;
  const partnerName = partner?.displayName?.trim() || 'Собеседник';
  const hasText = useMemo(() => text.trim().length > 0, [text]);
  const lastMarkedMessageId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentLastId = messages?.[messages.length - 1]?.id ?? null;
    if (!pairId || !currentLastId || markRead.isPending) return;
    if (lastMarkedMessageId.current === currentLastId) return;
    lastMarkedMessageId.current = currentLastId;
    void markRead.mutateAsync();
  }, [messages, markRead, pairId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages?.length]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    await sendMessage.mutateAsync(body);
    setText('');
  };

  return (
    <div
      className="flex min-h-[calc(100svh-120px)] flex-col"
      style={{
        paddingBottom:
          'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 96px)',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push('/m/matches')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--ios-tint))] active:scale-[0.94]"
          aria-label="Назад"
          style={{
            background: 'rgb(var(--ios-tint) / 0.12)',
            transitionDuration: 'var(--dur-base)',
            transitionTimingFunction: 'var(--ease-ios)',
            transitionProperty: 'transform, background-color, opacity',
          }}
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          onClick={() => setIsProfileOpen(true)}
          className="min-w-0 flex items-center gap-2 rounded-xl px-1 py-1 active:scale-[0.98]"
          aria-label={`Открыть профиль ${partnerName}`}
        >
          <Avatar name={partnerName} url={partner?.avatarUrl} size={36} />
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold leading-tight text-[rgb(var(--ios-label))]">
              {partnerName}
            </h1>
            <p className="truncate text-[12px] text-[rgb(var(--ios-label-secondary)/0.75)]">
              Онлайн в Match
            </p>
          </div>
        </button>
      </div>
      <div ref={scrollRef} className="-mx-1 flex-1 overflow-y-auto px-1 py-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="ios-spinner" aria-label="Загрузка" />
          </div>
        ) : null}
        {messages?.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isMine={
              profileId
                ? profileId === msg.senderProfileId
                : partnerId
                  ? msg.senderProfileId !== partnerId
                  : false
            }
          />
        ))}
      </div>

      <form
        className="glass glass-edge mt-3 flex items-center gap-2 rounded-full px-1.5 py-1.5 focus-within:border-[rgb(var(--ios-tint)/0.45)]"
        style={{
          marginBottom:
            'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 12px)',
          borderColor: 'rgb(var(--hairline))',
          transitionDuration: 'var(--dur-base)',
          transitionTimingFunction: 'var(--ease-soft)',
          transitionProperty: 'border-color, box-shadow, background-color',
        }}
        onSubmit={onSubmit}
      >
        <input
          className="flex-1 border-0 bg-transparent px-3 py-2 text-[15px] text-[rgb(var(--ios-label))] placeholder:text-[rgb(var(--ios-label-secondary)/0.5)] focus:outline-none"
          value={text}
          placeholder="Сообщение"
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white active:scale-[0.9] disabled:opacity-40"
          disabled={!hasText || sendMessage.isPending}
          aria-label="Отправить"
          style={{
            background: 'rgb(var(--ios-tint))',
            boxShadow: '0 6px 16px -8px rgb(var(--ios-tint) / 0.6)',
            transitionDuration: 'var(--dur-base)',
            transitionTimingFunction: 'var(--ease-ios)',
            transitionProperty: 'transform, background-color, opacity',
          }}
        >
          <Send size={16} strokeWidth={2.4} />
        </button>
      </form>

      <ProfileDetailModal
        open={isProfileOpen && Boolean(partnerProfile)}
        card={partnerProfile ?? null}
        onClose={() => setIsProfileOpen(false)}
      />
    </div>
  );
}
