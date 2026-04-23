'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionBar } from '../_components/ActionBar';
import { MatchModal } from '../_components/MatchModal';
import { ProfileDetailModal } from '../_components/ProfileDetailModal';
import { SwipeStack } from '../_components/SwipeStack';
import {
  TUTORIAL_STORAGE_KEY,
  WelcomeTutorial,
} from '../_components/WelcomeTutorial';
import type { FeedCard } from '../_lib/api';
import { useMatchStore } from '../_lib/store';
import { hapticImpact, hapticNotification } from '../_lib/telegram';
import {
  useMatchFeed,
  useMatchMe,
  useSwipeResetMutation,
  useSwipeResetPreview,
  useSwipeMutation,
  useUndoSwipeMutation,
} from '../_lib/queries';

export default function MatchFeedPage() {
  const router = useRouter();
  const { data: meData, isLoading: meLoading } = useMatchMe();
  const {
    data: feedData,
    isPending: feedInitialLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMatchFeed(20);
  const swipeMutation = useSwipeMutation();
  const undoMutation = useUndoSwipeMutation();
  const resetPreviewQuery = useSwipeResetPreview();
  const resetSwipeMutation = useSwipeResetMutation();
  const {
    feed,
    setFeed,
    appendFeed,
    popFeedTop,
    matchModal,
    showMatchModal,
    closeMatchModal,
  } = useMatchStore();
  const lastSeenPageCountRef = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissedAutoResetAt, setDismissedAutoResetAt] = useState<string | null>(null);
  const [openedProfile, setOpenedProfile] = useState<FeedCard | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (meData?.profile === null && !meLoading) {
      router.replace('/m/onboarding');
    }
  }, [meData, meLoading, router]);

  // First-time welcome tutorial: trigger once the profile is loaded so we
  // never flash it in front of an unboarded user (they get redirected).
  // Flag is per-device in localStorage — good enough for a first-session
  // nudge; we don't need cross-device sync for a coachmark.
  // The async/Promise.resolve dance keeps react-hooks/set-state-in-effect
  // happy (same pattern as onboarding/page.tsx).
  useEffect(() => {
    if (!meData?.profile) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1') return;
    let cancelled = false;
    const trigger = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setShowTutorial(true);
    };
    void trigger();
    return () => {
      cancelled = true;
    };
  }, [meData?.profile]);

  const completeTutorial = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    }
    setShowTutorial(false);
  };

  useEffect(() => {
    if (!feedData) return;
    const pages = feedData.pages;
    if (pages.length < lastSeenPageCountRef.current) {
      lastSeenPageCountRef.current = 0;
      setFeed([]);
    }
    if (pages.length === 0) {
      lastSeenPageCountRef.current = 0;
      return;
    }
    if (pages.length === 1 && lastSeenPageCountRef.current === 0) {
      setFeed(pages[0].items);
    } else if (pages.length > lastSeenPageCountRef.current) {
      const newPages = pages.slice(lastSeenPageCountRef.current);
      for (const p of newPages) {
        appendFeed(p.items);
      }
    }
    lastSeenPageCountRef.current = pages.length;
  }, [feedData, setFeed, appendFeed]);

  useEffect(() => {
    if (feed.length > 3) return;
    if (!hasNextPage) return;
    if (isFetchingNextPage) return;
    void fetchNextPage();
  }, [feed.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, []);

  const showAutoResetBanner = useMemo(() => {
    const resetAt = meData?.profile?.lastSwipeResetAt;
    const triggeredBy = meData?.lastResetTriggeredBy;
    if (!resetAt || dismissedAutoResetAt === resetAt) return false;
    if (triggeredBy !== 'auto' && triggeredBy !== 'auto_catchup') return false;
    const resetDate = new Date(resetAt);
    if (Number.isNaN(resetDate.getTime())) return false;
    if (typeof window === 'undefined') return false;
    const key = `seenAutoResetBanner-${resetAt}`;
    return window.localStorage.getItem(key) !== '1';
  }, [meData?.profile?.lastSwipeResetAt, meData?.lastResetTriggeredBy, dismissedAutoResetAt]);

  const topCard = useMemo(() => feed[0] ?? null, [feed]);
  const hasCards = feed.length > 0;
  const likeLimit = meData?.likeLimitPerDay ?? 0;
  const likesToday = meData?.likeCountToday ?? 0;
  const canLike = hasCards && likesToday < likeLimit && !swipeMutation.isPending;
  const statusTone =
    likesToday >= likeLimit
      ? 'text-[rgb(var(--ios-red))]'
      : likesToday >= 25
        ? 'text-[rgb(var(--ios-orange))]'
        : 'text-[rgb(var(--ios-label-secondary))]';
  const hasActiveFilters = Boolean(
    meData?.settings &&
      (meData.settings.interestedRoles.length > 0 ||
        meData.settings.interestedNiches.length > 0 ||
        meData.settings.interestedWorkFormats.length > 0 ||
        meData.settings.interestedMarketplaces.length > 0 ||
        meData.settings.sameCityOnly),
  );

  const doSwipe = async (direction: 'LIKE' | 'PASS') => {
    if (!topCard || swipeMutation.isPending) return;
    hapticImpact('light');
    try {
      const result = await swipeMutation.mutateAsync({
        toProfileId: topCard.id,
        direction,
      });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const data = (error as Error & { data?: { resetAt?: string } }).data;
      if (message.includes('like_limit_reached')) {
        const resetAt = data?.resetAt ? new Date(data.resetAt) : null;
        const minutesLeft = resetAt
          ? Math.max(0, Math.round((resetAt.getTime() - Date.now()) / 60000))
          : null;
        setToast(
          minutesLeft !== null
            ? `Лимит лайков на сегодня исчерпан. Сброс через ~${minutesLeft} мин.`
            : 'Лимит лайков на сегодня исчерпан.',
        );
      } else if (message.includes('undo_cooldown')) {
        setToast('Undo временно недоступен: действует кулдаун.');
      } else {
        setToast('Не удалось выполнить действие.');
      }
    }
  };

  if (meLoading || feedInitialLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ios-spinner" aria-label="Загрузка" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {meData ? (
          <div
            className={`glass-ultra-thin flex items-center gap-2 rounded-full border border-[rgb(var(--hairline))] px-2.5 py-1 text-[12px] font-semibold ${statusTone}`}
          >
            <span aria-hidden>🔥</span>
            <span>{meData.streak.current}</span>
            <span className="text-[rgb(var(--ios-label-secondary)/0.6)]">·</span>
            <span>
              {meData.likeCountToday}/{meData.likeLimitPerDay}
            </span>
          </div>
        ) : null}
      </div>
      {showAutoResetBanner ? (
        <div
          className="glass glass-edge mb-3 rounded-2xl px-4 py-3 text-[14px]"
          style={{
            borderColor: 'rgb(var(--ios-tint) / 0.3)',
            background:
              'linear-gradient(135deg, rgb(var(--ios-tint) / 0.14), rgb(var(--ios-pink) / 0.1))',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">🔄 Мы обновили вашу ленту</div>
              <div className="mt-0.5 text-[12px] text-[rgb(var(--ios-label-secondary)/0.8)]">
                Вернули {meData?.lastResetDeletedCount ?? 0} ранее пропущенных людей.
              </div>
            </div>
            <button
              type="button"
              className="text-[13px] font-medium text-[rgb(var(--ios-tint))]"
              onClick={() => {
                const resetAt = meData?.profile?.lastSwipeResetAt;
                if (resetAt && typeof window !== 'undefined') {
                  window.localStorage.setItem(`seenAutoResetBanner-${resetAt}`, '1');
                }
                setDismissedAutoResetAt(resetAt ?? null);
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
      {topCard ? (
        <div>
          <SwipeStack
            cards={feed}
            onDecision={(direction) => {
              void doSwipe(direction);
            }}
            onCardTap={(card) => setOpenedProfile(card)}
          />
        </div>
      ) : null}
      {!topCard && isFetchingNextPage ? (
        <div className="mt-3 flex min-h-[40vh] items-center justify-center">
          <div className="ios-spinner" aria-label="Загрузка" />
        </div>
      ) : null}
      {!topCard && !isFetchingNextPage ? (
        <div className="mt-3 flex min-h-[56vh] flex-col items-center justify-center gap-6 px-6 pb-24 pt-8">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            style={{ background: 'rgb(var(--ios-tint) / 0.15)' }}
          >
            🔍
          </div>
          <div className="space-y-1.5 text-center">
            <h2 className="ios-title">Карточки закончились</h2>
            <p className="text-[14px] text-[rgb(var(--ios-label-secondary)/0.8)]">
              Посмотрите ещё раз через пару часов или расширьте поиск.
            </p>
          </div>
          <div className="w-full space-y-2">
            {resetPreviewQuery.data ? (
              <button
                type="button"
                onClick={() => {
                  void resetSwipeMutation
                    .mutateAsync()
                    .then((result) => {
                      setToast(`Вернули в ленту ${result.deletedCount} ранее пропущенных.`);
                    })
                    .catch((error: unknown) => {
                      const message =
                        error instanceof Error ? error.message : 'Не удалось обновить ленту.';
                      setToast(message);
                    });
                }}
                disabled={
                  resetSwipeMutation.isPending ||
                  resetPreviewQuery.data.resettableCount === 0
                }
                className="ios-btn-plain w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetPreviewQuery.data.resettableCount === 0
                  ? 'Ранее свайпнутых нет'
                  : `Показать заново дизлайкнутых (${resetPreviewQuery.data.resettableCount})`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push('/m/settings')}
              className="ios-btn-plain w-full"
            >
              {hasActiveFilters ? 'Изменить фильтры' : 'Настроить фильтры'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/m/profile#invites')}
              className="ios-btn-primary w-full"
            >
              Пригласить друзей
            </button>
          </div>
        </div>
      ) : null}
      <ActionBar
        onPass={hasCards && !swipeMutation.isPending ? () => void doSwipe('PASS') : undefined}
        onLike={canLike ? () => void doSwipe('LIKE') : undefined}
        onUndo={
          !undoMutation.isPending && !swipeMutation.isPending
            ? () => void undoMutation.mutateAsync()
            : undefined
        }
      />
      {toast ? (
        <div
          className="glass glass-edge mt-3 rounded-2xl px-4 py-2.5 text-[14px]"
          style={{
            borderColor: 'rgb(var(--ios-red) / 0.3)',
            color: 'rgb(var(--ios-red))',
          }}
        >
          {toast}
        </div>
      ) : null}

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

      <ProfileDetailModal
        open={!!openedProfile}
        card={openedProfile}
        onClose={() => setOpenedProfile(null)}
      />

      <WelcomeTutorial open={showTutorial} onFinish={completeTutorial} />
    </div>
  );
}
