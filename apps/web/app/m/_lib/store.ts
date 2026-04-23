'use client';

import { create } from 'zustand';
import type { FeedCard, MatchProfile } from './api';

type MatchUiState = {
  profile: MatchProfile | null;
  feed: FeedCard[];
  matchModal:
    | null
    | {
        pairId: string;
        partner: { id: string; displayName: string; avatarUrl: string | null };
      };
  setProfile: (profile: MatchProfile | null) => void;
  setFeed: (feed: FeedCard[]) => void;
  appendFeed: (next: FeedCard[]) => void;
  popFeedTop: () => void;
  showMatchModal: (value: NonNullable<MatchUiState['matchModal']>) => void;
  closeMatchModal: () => void;
};

export const useMatchStore = create<MatchUiState>((set) => ({
  profile: null,
  feed: [],
  matchModal: null,
  setProfile: (profile) => set({ profile }),
  setFeed: (feed) => set({ feed }),
  appendFeed: (next) =>
    set((state) => {
      const seen = new Set(state.feed.map((c) => c.id));
      const merged = next.filter((c) => !seen.has(c.id));
      return { feed: [...state.feed, ...merged] };
    }),
  popFeedTop: () => set((state) => ({ feed: state.feed.slice(1) })),
  showMatchModal: (value) => set({ matchModal: value }),
  closeMatchModal: () => set({ matchModal: null }),
}));
