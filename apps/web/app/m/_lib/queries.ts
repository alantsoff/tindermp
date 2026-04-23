'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedPage } from './api';
import { FavoriteItem, matchApi } from './api';

export const matchKeys = {
  me: ['match', 'me'] as const,
  feed: ['match', 'feed'] as const,
  settings: ['match', 'settings'] as const,
  matches: ['match', 'matches'] as const,
  matchPartner: (pairId: string) => ['match', 'partner', pairId] as const,
  favorites: ['match', 'favorites'] as const,
  invites: ['match', 'invites'] as const,
  swipeResetPreview: ['match', 'swipe-reset-preview'] as const,
  messages: (pairId: string) => ['match', 'messages', pairId] as const,
};

export function useMatchMe() {
  return useQuery({
    queryKey: matchKeys.me,
    queryFn: () => matchApi.me(),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useMatchFeed(limit = 20) {
  return useInfiniteQuery<FeedPage, Error>({
    queryKey: [...matchKeys.feed, limit],
    queryFn: ({ pageParam }) => matchApi.feed(limit, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextOffset != null
        ? lastPage.nextOffset
        : undefined,
    staleTime: 0,
    retry: 0,
  });
}

export function useSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ toProfileId, direction }: { toProfileId: string; direction: 'LIKE' | 'PASS' }) =>
      matchApi.swipe(toProfileId, direction),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.swipeResetPreview });
      void qc.invalidateQueries({ queryKey: matchKeys.me });
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
      void qc.invalidateQueries({ queryKey: matchKeys.favorites });
    },
  });
}

export function useUndoSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchApi.undoSwipe(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
      void qc.invalidateQueries({ queryKey: matchKeys.favorites });
    },
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: matchKeys.favorites,
    queryFn: () => matchApi.favorites(),
    retry: 0,
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toProfileId: string) => matchApi.removeFavorite(toProfileId),
    onMutate: async (toProfileId) => {
      await qc.cancelQueries({ queryKey: matchKeys.favorites });
      const prev = qc.getQueryData<FavoriteItem[]>(matchKeys.favorites);
      qc.setQueryData<FavoriteItem[]>(
        matchKeys.favorites,
        (old) => (old ?? []).filter((item) => item.partner.id !== toProfileId),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(matchKeys.favorites, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.favorites });
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
    },
  });
}

export function useSwipeResetPreview() {
  return useQuery({
    queryKey: matchKeys.swipeResetPreview,
    queryFn: () => matchApi.swipeResetPreview(),
    retry: 0,
  });
}

export function useSwipeResetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchApi.resetSwipe(),
    onSuccess: () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: matchKeys.feed }),
        qc.invalidateQueries({ queryKey: matchKeys.swipeResetPreview }),
        qc.invalidateQueries({ queryKey: matchKeys.me }),
      ]);
    },
  });
}

export function useMatches() {
  return useQuery({
    queryKey: matchKeys.matches,
    queryFn: () => matchApi.matches(),
    staleTime: 3_000,
    refetchInterval: () =>
      typeof document === 'undefined' || document.visibilityState === 'visible'
        ? 15_000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}

export function useMatchPartner(pairId: string, enabled = true) {
  return useQuery({
    queryKey: matchKeys.matchPartner(pairId),
    queryFn: () => matchApi.matchPartner(pairId),
    enabled: Boolean(pairId) && enabled,
    retry: 0,
  });
}

export function useMessages(pairId: string) {
  return useQuery({
    queryKey: matchKeys.messages(pairId),
    queryFn: () => matchApi.messages(pairId),
    enabled: !!pairId,
    staleTime: 2_000,
    refetchInterval: () =>
      typeof document === 'undefined' || document.visibilityState === 'visible'
        ? 5_000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}

export function useSendMessage(pairId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => matchApi.sendMessage(pairId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.messages(pairId) });
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
    },
  });
}

export function useMarkPairRead(pairId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchApi.markPairRead(pairId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
    },
  });
}

export function useArchivePair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pairId: string) => matchApi.archivePair(pairId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
    },
  });
}

export function useUnarchivePair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pairId: string) => matchApi.unarchivePair(pairId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => matchApi.saveSettings(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.settings });
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
    },
  });
}

export function usePauseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days?: number) => matchApi.pause(days),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.me });
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
    },
  });
}

export function useInvites() {
  return useQuery({
    queryKey: matchKeys.invites,
    queryFn: () => matchApi.invites(),
    retry: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 30_000,
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => matchApi.revokeInvite(code),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.invites });
      void qc.invalidateQueries({ queryKey: matchKeys.me });
    },
  });
}
