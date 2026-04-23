'use client';

export const ADMIN_TOKEN_KEY = 'matchAdminToken';

function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined') return '';
  return 'http://127.0.0.1:3001';
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (auth) {
    const token = getAdminToken();
    if (!token) throw new Error('admin_auth_required');
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearAdminToken();
      throw new Error('admin_auth_required');
    }
    const payload = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type AdminOverview = {
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    newProfiles7d: number;
    swipes24h: number;
    matches24h: number;
    redeems24h: number;
  };
  dauSeries: Array<{ day: string; value: number }>;
  topSuspicious: Array<{
    profileId: string;
    displayName: string;
    role: string;
    suspicionScore: number;
    bannedAt: string | null;
  }>;
  marketplaceDistribution: Array<{ marketplace: string; count: number }>;
  workFormatDistribution: Array<{ workFormat: string; count: number }>;
};

export const matchAdminApi = {
  login(telegramId: string, password: string) {
    return adminFetch<{ token: string }>(
      '/match-admin/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ telegramId, password }),
      },
      false,
    );
  },
  me() {
    return adminFetch<{ ok: boolean; userId: string | null; telegramId: string | null }>(
      '/match-admin/auth/me',
    );
  },
  overview() {
    return adminFetch<AdminOverview>('/match-admin/overview');
  },
  timeseries(metric: string, period = 30) {
    return adminFetch<Array<{ day: string; value: number }>>(
      `/match-admin/timeseries?metric=${encodeURIComponent(metric)}&period=${period}`,
    );
  },
  metricsSeries(params: { granularity: 'day' | 'hour'; period: number }) {
    const search = new URLSearchParams();
    search.set('granularity', params.granularity);
    search.set('period', String(params.period));
    return adminFetch<{
      granularity: 'day' | 'hour';
      periodDays: number;
      points: Array<{
        t: string;
        registrations: number;
        swipes: number;
        matches: number;
      }>;
    }>(`/match-admin/metrics-series?${search.toString()}`);
  },
  roleDistribution() {
    return adminFetch<Array<{ role: string; count: number }>>('/match-admin/role-distribution');
  },
  users(params: {
    query?: string;
    role?: string;
    workFormat?: string;
    marketplace?: string;
    banned?: string;
    limit?: number;
    offset?: number;
  }) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      search.set(key, String(value));
    }
    return adminFetch<{ total: number; items: Array<Record<string, unknown>> }>(
      `/match-admin/users?${search.toString()}`,
    );
  },
  user(profileId: string) {
    return adminFetch<Record<string, unknown>>(`/match-admin/users/${profileId}`);
  },
  userEvents(profileId: string, limit = 100) {
    return adminFetch<Array<Record<string, unknown>>>(
      `/match-admin/users/${profileId}/events?limit=${limit}`,
    );
  },
  spamFlagged(minScore = 60) {
    return adminFetch<Array<Record<string, unknown>>>(
      `/match-admin/spam/flagged?minScore=${minScore}`,
    );
  },
  recomputeSpam(profileId?: string) {
    return adminFetch('/match-admin/spam/recompute', {
      method: 'POST',
      body: JSON.stringify(profileId ? { profileId } : {}),
    });
  },
  ban(profileId: string, payload: { reason: string; shadow?: boolean }) {
    return adminFetch(`/match-admin/users/${profileId}/ban`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  unban(profileId: string, reason: string) {
    return adminFetch(`/match-admin/users/${profileId}/unban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  cascadeBanPreview(profileId: string) {
    return adminFetch<{ targetCount: number; confirmToken: string }>(
      `/match-admin/users/${profileId}/cascade-ban/preview`,
      { method: 'POST' },
    );
  },
  cascadeBan(profileId: string, confirmToken: string, reason: string) {
    return adminFetch(`/match-admin/users/${profileId}/cascade-ban`, {
      method: 'POST',
      body: JSON.stringify({ confirmToken, reason }),
    });
  },
  cascadeRevokePreview(profileId: string) {
    return adminFetch<{ revokableCodes: number; confirmToken: string }>(
      `/match-admin/users/${profileId}/cascade-revoke/preview`,
      { method: 'POST' },
    );
  },
  cascadeRevoke(profileId: string, confirmToken: string, reason: string) {
    return adminFetch(`/match-admin/users/${profileId}/cascade-revoke`, {
      method: 'POST',
      body: JSON.stringify({ confirmToken, reason }),
    });
  },
  issueToSelf(count: number) {
    return adminFetch<Array<Record<string, unknown>>>('/match-admin/invites/issue-to-self', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
  },
  issueToProfile(profileId: string, count: number, reason: string) {
    return adminFetch('/match-admin/invites/issue-to-profile', {
      method: 'POST',
      body: JSON.stringify({ profileId, count, reason }),
    });
  },
  issueDetached(count: number, reason: string, label?: string) {
    return adminFetch<Array<Record<string, unknown>>>('/match-admin/invites/issue-detached', {
      method: 'POST',
      body: JSON.stringify({ count, reason, label }),
    });
  },
  issueToAdmins(count: number, reason: string) {
    return adminFetch('/match-admin/invites/issue-to-admins', {
      method: 'POST',
      body: JSON.stringify({ count, reason }),
    });
  },
  bulkGift(profileIds: string[], countEach: number, reason: string) {
    return adminFetch('/match-admin/invites/bulk-gift', {
      method: 'POST',
      body: JSON.stringify({ profileIds, countEach, reason }),
    });
  },
  invites(params: { status?: string; owner?: string; usedBy?: string; source?: string }) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      search.set(key, String(value));
    }
    return adminFetch<Array<Record<string, unknown>>>(`/match-admin/invites?${search.toString()}`);
  },
  revokeInvite(code: string, reason: string) {
    return adminFetch(`/match-admin/invites/${encodeURIComponent(code)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  inviteTree(rootProfileId: string, depth = 3) {
    return adminFetch<Record<string, unknown>>(
      `/match-admin/invite-tree/${rootProfileId}?depth=${depth}`,
    );
  },
  inviteRoots(limit = 50) {
    return adminFetch<Array<Record<string, unknown>>>(`/match-admin/invite-roots?limit=${limit}`);
  },
  ancestors(profileId: string) {
    return adminFetch<Array<Record<string, unknown>>>(
      `/match-admin/invite-tree/${profileId}/ancestors`,
    );
  },
  searchTree(q: string) {
    return adminFetch<Array<Record<string, unknown>>>(
      `/match-admin/invite-tree/search?q=${encodeURIComponent(q)}`,
    );
  },
  audit(params: { admin?: string; action?: string; target?: string; limit?: number }) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      search.set(key, String(value));
    }
    return adminFetch<Array<Record<string, unknown>>>(`/match-admin/audit?${search.toString()}`);
  },
  liveEvents(limit = 50) {
    return adminFetch<Array<Record<string, unknown>>>(`/match-admin/live/events?limit=${limit}`);
  },
};
