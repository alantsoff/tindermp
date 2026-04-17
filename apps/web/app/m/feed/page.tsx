'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ActionBar } from '../_components/ActionBar';
import { MatchModal } from '../_components/MatchModal';
import { SwipeStack } from '../_components/SwipeStack';
import { useMatchStore } from '../_lib/store';
import { hapticImpact, hapticNotification } from '../_lib/telegram';
import { useMatchFeed, useMatchMe, useSwipeMutation, useUndoSwipeMutation } from '../_lib/queries';

export default function MatchFeedPage() {
  const router = useRouter();
  const { data: meData, isLoading: meLoading } = useMatchMe();
  const { data: feedData, isLoading: feedLoading } = useMatchFeed(20);
  const swipeMutation = useSwipeMutation();
  const undoMutation = useUndoSwipeMutation();
  const { feed, setFeed, popFeedTop, matchModal, showMatchModal, closeMatchModal } = useMatchStore();

  useEffect(() => {
    if (meData?.profile === null && !meLoading) {
      router.replace('/m/onboarding');
    }
  }, [meData, meLoading, router]);

  useEffect(() => {
    if (feedData) setFeed(feedData);
  }, [feedData, setFeed]);

  const topCard = useMemo(() => feed[0] ?? null, [feed]);

  const doSwipe = async (direction: 'LIKE' | 'PASS') => {
    if (!topCard || swipeMutation.isPending) return;
    hapticImpact('light');
    try {
      const result = await swipeMutation.mutateAsync({ toProfileId: topCard.id, direction });
      popFeedTop();
      if (direction === 'LIKE') hapticNotification('success');
      if (direction === 'PASS') hapticNotification('warning');
      if (result.matched && result.partner && result.pairId) {
        showMatchModal({
          pairId: result.pairId,
          partner: {
            id: result.partner.id,
            displayName: result.partner.displayName,
            avatarUrl: result.partner.avatarUrl,
          },
        });
      }
    } catch {
      // no-op
    }
  };

  if (meLoading || feedLoading) {
    return <div className="py-20 text-center text-sm text-zinc-400">Загружаем ленту…</div>;
  }

  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Лента</h1>
      <SwipeStack
        cards={feed}
        onDecision={(direction) => {
          void doSwipe(direction);
        }}
      />
      <ActionBar
        disabled={swipeMutation.isPending}
        onPass={() => void doSwipe('PASS')}
        onLike={() => void doSwipe('LIKE')}
        onUndo={() => void undoMutation.mutateAsync()}
      />

      <MatchModal
        open={!!matchModal}
        partnerName={matchModal?.partner.displayName ?? ''}
        onOpenChat={() => {
          if (!matchModal?.pairId) return;
          closeMatchModal();
          router.push(`/m/matches/${matchModal.pairId}`);
        }}
        onContinue={closeMatchModal}
      />
    </div>
  );
}
