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
  popFeedTop: () => set((state) => ({ feed: state.feed.slice(1) })),
  showMatchModal: (value) => set({ matchModal: value }),
  closeMatchModal: () => set({ matchModal: null }),
}));
