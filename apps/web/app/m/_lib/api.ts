'use client';

export const MATCH_TOKEN_KEY = 'matchAccessToken';

type MatchRequestInit = RequestInit & { auth?: boolean };

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

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(MATCH_TOKEN_KEY);
}

export function setMatchToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MATCH_TOKEN_KEY, token);
}

export function clearMatchToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MATCH_TOKEN_KEY);
}

async function request<T>(path: string, init: MatchRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.auth !== false) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type MatchProfile = {
  id: string;
  role: string;
  roleCustom: string | null;
  displayName: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  niches: string[];
  skills: string[];
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  avatarUrl: string | null;
  portfolioUrl: string | null;
  telegramContact: string | null;
  isActive: boolean;
};

export type MatchSettings = {
  id: string;
  profileId: string;
  interestedRoles: string[];
  interestedNiches: string[];
  hideFromFeed: boolean;
};

export type MatchMeResponse = {
  profile: MatchProfile | null;
  settings: MatchSettings | null;
};

export type FeedCard = MatchProfile & { roleLabel: string };

export type MatchPair = {
  id: string;
  createdAt: string;
  partner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    roleCustom: string | null;
  } | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderProfileId: string;
  } | null;
};

export type MatchMessage = {
  id: string;
  pairId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
};

export const matchApi = {
  auth(initData: string) {
    return request<{ token: string; profileId: string | null }>('/match-api/auth', {
      method: 'POST',
      body: JSON.stringify({ initData }),
      auth: false,
    });
  },
  me() {
    return request<MatchMeResponse>('/match-api/me');
  },
  upsertProfile(payload: Record<string, unknown>) {
    return request<MatchMeResponse>('/match-api/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSettings() {
    return request<MatchSettings>('/match-api/settings');
  },
  saveSettings(payload: Record<string, unknown>) {
    return request<MatchSettings>('/match-api/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  feed(limit = 20) {
    return request<FeedCard[]>(`/match-api/feed?limit=${limit}`);
  },
  swipe(toProfileId: string, direction: 'LIKE' | 'PASS') {
    return request<{
      matched: boolean;
      pairId?: string;
      partner?: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
        role: string;
        roleCustom: string | null;
        telegramContact?: string | null;
      };
    }>('/match-api/swipe', {
      method: 'POST',
      body: JSON.stringify({ toProfileId, direction }),
    });
  },
  undoSwipe() {
    return request<{ undone: boolean }>('/match-api/swipe/undo', { method: 'POST' });
  },
  matches() {
    return request<MatchPair[]>('/match-api/matches');
  },
  messages(pairId: string) {
    return request<MatchMessage[]>(`/match-api/matches/${pairId}/messages`);
  },
  sendMessage(pairId: string, body: string) {
    return request<MatchMessage>(`/match-api/matches/${pairId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
};
