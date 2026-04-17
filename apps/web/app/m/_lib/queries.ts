'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { matchApi } from './api';

export const matchKeys = {
  me: ['match', 'me'] as const,
  feed: ['match', 'feed'] as const,
  settings: ['match', 'settings'] as const,
  matches: ['match', 'matches'] as const,
  messages: (pairId: string) => ['match', 'messages', pairId] as const,
};

export function useMatchMe() {
  return useQuery({
    queryKey: matchKeys.me,
    queryFn: () => matchApi.me(),
    retry: 0,
  });
}

export function useMatchFeed(limit = 20) {
  return useQuery({
    queryKey: [...matchKeys.feed, limit],
    queryFn: () => matchApi.feed(limit),
    retry: 0,
  });
}

export function useSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ toProfileId, direction }: { toProfileId: string; direction: 'LIKE' | 'PASS' }) =>
      matchApi.swipe(toProfileId, direction),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.matches });
    },
  });
}

export function useUndoSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchApi.undoSwipe(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
    },
  });
}

export function useMatches() {
  return useQuery({
    queryKey: matchKeys.matches,
    queryFn: () => matchApi.matches(),
    retry: 0,
  });
}

export function useMessages(pairId: string) {
  return useQuery({
    queryKey: matchKeys.messages(pairId),
    queryFn: () => matchApi.messages(pairId),
    enabled: !!pairId,
    refetchInterval: 3000,
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
