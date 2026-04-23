'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { matchAdminApi } from './api';

const keys = {
  authMe: ['match-admin', 'auth', 'me'] as const,
  overview: ['match-admin', 'overview'] as const,
  users: (params: Record<string, unknown>) => ['match-admin', 'users', params] as const,
  user: (profileId: string) => ['match-admin', 'user', profileId] as const,
  invites: (params: Record<string, unknown>) => ['match-admin', 'invites', params] as const,
  spam: (minScore: number) => ['match-admin', 'spam', minScore] as const,
  roots: ['match-admin', 'roots'] as const,
  audit: (params: Record<string, unknown>) => ['match-admin', 'audit', params] as const,
  live: ['match-admin', 'live'] as const,
};

export function useAdminAuthMe() {
  return useQuery({
    queryKey: keys.authMe,
    queryFn: () => matchAdminApi.me(),
    retry: 0,
  });
}

export function useAdminOverview() {
  return useQuery({ queryKey: keys.overview, queryFn: () => matchAdminApi.overview() });
}

export function useAdminUsers(params: {
  query?: string;
  role?: string;
  workFormat?: string;
  marketplace?: string;
  banned?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: keys.users(params),
    queryFn: () => matchAdminApi.users(params),
  });
}

export function useAdminUser(profileId: string) {
  return useQuery({
    queryKey: keys.user(profileId),
    queryFn: () => matchAdminApi.user(profileId),
    enabled: !!profileId,
  });
}

export function useAdminInvites(params: { status?: string; owner?: string; usedBy?: string; source?: string }) {
  return useQuery({
    queryKey: keys.invites(params),
    queryFn: () => matchAdminApi.invites(params),
  });
}

export function useAdminSpam(minScore = 60) {
  return useQuery({
    queryKey: keys.spam(minScore),
    queryFn: () => matchAdminApi.spamFlagged(minScore),
  });
}

export function useAdminRoots() {
  return useQuery({
    queryKey: keys.roots,
    queryFn: () => matchAdminApi.inviteRoots(50),
  });
}

export function useAdminAudit(params: { admin?: string; action?: string; target?: string }) {
  return useQuery({
    queryKey: keys.audit(params),
    queryFn: () => matchAdminApi.audit(params),
  });
}

export function useAdminLive() {
  return useQuery({
    queryKey: keys.live,
    queryFn: () => matchAdminApi.liveEvents(100),
    refetchInterval: 5000,
  });
}

export function useIssueToSelfMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (count: number) => matchAdminApi.issueToSelf(count),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.overview });
      void qc.invalidateQueries({ queryKey: ['match-admin', 'invites'] });
    },
  });
}

export function useIssueToProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { profileId: string; count: number; reason: string }) =>
      matchAdminApi.issueToProfile(payload.profileId, payload.count, payload.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['match-admin'] });
    },
  });
}

export function useIssueDetachedMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { count: number; reason: string; label?: string }) =>
      matchAdminApi.issueDetached(payload.count, payload.reason, payload.label),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['match-admin', 'invites'] });
    },
  });
}

export function useRevokeInviteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; reason: string }) =>
      matchAdminApi.revokeInvite(payload.code, payload.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['match-admin', 'invites'] });
    },
  });
}
