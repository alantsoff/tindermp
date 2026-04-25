'use client';

import {
  hasTelegramUserAgent,
  hasTelegramWebApp,
  isLocalAuthBypassEnabled,
  waitForInitData,
} from './telegram';

export const MATCH_TOKEN_KEY = 'matchAccessToken';
let authInFlight: Promise<void> | null = null;
const LOCAL_DEV_TOKEN = 'match-local-dev-token';
const localSwipeHistory: string[] = [];
const localSwipedIds = new Set<string>();

// Коды ошибок авторизации — прокидываем в UI, чтобы показывать разные
// сообщения в зависимости от причины (см. MatchBootstrap).
export const AUTH_ERROR_NO_TELEGRAM = 'auth_no_telegram';
export const AUTH_ERROR_INIT_DATA_LOST = 'auth_init_data_lost';
// Юзер ВНУТРИ Telegram (UA совпадает), но JS SDK не загрузился —
// типично при блокировке telegram.org прокси/VPN/ISP.
export const AUTH_ERROR_TELEGRAM_SDK_BLOCKED = 'auth_telegram_sdk_blocked';

export type MatchAuthErrorCode =
  | typeof AUTH_ERROR_NO_TELEGRAM
  | typeof AUTH_ERROR_INIT_DATA_LOST
  | typeof AUTH_ERROR_TELEGRAM_SDK_BLOCKED;

export class MatchAuthError extends Error {
  readonly code: MatchAuthErrorCode;
  constructor(code: MatchAuthErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'MatchAuthError';
  }
}

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

async function ensureTelegramAuthToken(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (getToken()) return;
  if (authInFlight) return authInFlight;

  authInFlight = (async () => {
    if (isLocalDemoMode()) {
      setMatchToken(LOCAL_DEV_TOKEN);
      return;
    }
    // waitForInitData опрашивает window.Telegram.WebApp до 10 секунд —
    // защита от гонки с Telegram SDK (особенно при повторной авторизации
    // после 401 и на медленных сетях / прокси).
    const initData = await waitForInitData(10_000);
    if (!initData) {
      // Различаем три причины отсутствия initData:
      //  1. WebApp есть, но initData пустая → сессия утеряна, нужен
      //     перезапуск мини-аппа.
      //  2. WebApp нет, но UA говорит, что мы внутри Telegram → JS SDK
      //     не загрузился (вероятно, прокси/VPN режут telegram.org).
      //  3. WebApp нет и UA не Telegram → юзер реально не в Telegram
      //     (браузер / превью бота / старый клиент).
      if (hasTelegramWebApp()) {
        throw new MatchAuthError(
          AUTH_ERROR_INIT_DATA_LOST,
          'Сессия истекла. Закройте и откройте мини-приложение заново.',
        );
      }
      if (hasTelegramUserAgent()) {
        throw new MatchAuthError(
          AUTH_ERROR_TELEGRAM_SDK_BLOCKED,
          'Не удалось загрузить компоненты Telegram. Возможно, мешает VPN или прокси.',
        );
      }
      throw new MatchAuthError(
        AUTH_ERROR_NO_TELEGRAM,
        'Откройте приложение через Telegram-бота — в браузере авторизация невозможна.',
      );
    }

    const auth = await matchFetch<{ token: string; profileId: string | null }>('/match-api/auth', {
      method: 'POST',
      body: JSON.stringify({ initData }),
      auth: false,
    });
    setMatchToken(auth.token);
  })();

  try {
    await authInFlight;
  } finally {
    authInFlight = null;
  }
}

export async function matchFetch<T>(
  path: string,
  init: MatchRequestInit = {},
): Promise<T> {
  const runRequest = async (): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (init.auth !== false) {
      if (!getToken()) {
        await ensureTelegramAuthToken();
      }
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(buildApiUrl(path), {
      ...init,
      headers,
    });
  };

  let response = await runRequest();

  if (!response.ok && init.auth !== false && response.status === 401) {
    clearMatchToken();
    await ensureTelegramAuthToken();
    response = await runRequest();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
      resetAt?: string;
      [key: string]: unknown;
    };
    const error = new Error(
      payload.code ?? payload.message ?? `Request failed: ${response.status}`,
    ) as Error & { data?: Record<string, unknown> };
    error.data = payload;
    throw error;
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
  experience: number | null;
  city: string | null;
  birthDate: string | null;
  zodiacSign: string | null;
  workFormats: string[];
  marketplaces: string[];
  marketplacesCustom: string | null;
  niches: string[];
  skills: string[];
  tools: string[];
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  avatarUrl: string | null;
  photos?: { id: string; url: string; order: number }[];
  portfolioUrl: string | null;
  telegramContact: string | null;
  isActive: boolean;
  pausedUntil?: string | null;
  lastSwipeResetAt?: string | null;
  swipeStreakDays?: number;
  superLikeBalance?: number;
};

export type MatchSettings = {
  id: string;
  profileId: string;
  interestedRoles: string[];
  interestedWorkFormats: string[];
  sameCityOnly: boolean;
  interestedMarketplaces: string[];
  interestedNiches: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  photoPreference: 'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO';
  hideFromFeed: boolean;
};

export type MatchActivityQuadrant =
  | 'SOUGHT_AFTER'
  | 'SELECTIVE'
  | 'OVER_LIKER'
  | 'SLEEPING';

export type MatchActivitySnapshot = {
  quadrant: MatchActivityQuadrant;
  likesSent14d: number;
  likesReceived14d: number;
  matches14d: number;
  activityScore: number;
  reciprocityScore: number;
  scoreUpdatedAt: string | null;
  accountAgeDays: number;
};

export type MatchMeResponse = {
  profile: MatchProfile | null;
  settings: MatchSettings | null;
  streak: { current: number; nextRewardAt: number };
  superLikeBalance: number;
  pendingLikeCount: number;
  likeCountToday: number;
  likeLimitPerDay: number;
  invites: { available: number; issued: number; activated: number; nextGrantAt: string | null };
  isAdmin: boolean;
  featureInviteOnly: boolean;
  autoResetEnabled: boolean;
  lastResetTriggeredBy: 'manual' | 'auto' | 'auto_catchup' | null;
  lastResetDeletedCount: number;
  activity: MatchActivitySnapshot | null;
};

export type SwipeResetPreview = {
  canReset: boolean;
  resettableCount: number;
  nextAvailableAt: string | null;
  cooldownReason?: 'not_elapsed';
  autoResetEnabled: boolean;
  nextAutoResetAt: string | null;
};

export type ActivityBadge = 'ACTIVE_TODAY' | 'WEEKLY_TOP';

export type FeedCard = MatchProfile & {
  roleLabel: string;
  score?: number;
  activityBadge?: ActivityBadge | null;
};

export type FeedPage = {
  items: FeedCard[];
  hasMore: boolean;
  nextOffset: number | null;
};

export type MatchPartnerProfile = FeedCard;

export type MatchPair = {
  id: string;
  createdAt: string;
  lastMessageAt: string | null;
  hasUnread: boolean;
  unreadCount: number;
  isFirstMessageSystemOnly: boolean;
  isArchived: boolean;
  partner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
    roleCustom: string | null;
    niches: string[];
  } | null;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    senderProfileId: string;
    systemGenerated: boolean;
  } | null;
};

export type MatchMessage = {
  id: string;
  pairId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
  systemGenerated: boolean;
};

export type InviteCode = {
  id: string;
  code: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  source: string;
  usedBy?: { id: string; displayName: string; role: string } | null;
  invitee?: {
    displayName: string | null;
    role: string | null;
    roleCustom: string | null;
  } | null;
};

export type InviteListResponse = {
  all: InviteCode[];
  available: InviteCode[];
  used: InviteCode[];
  revoked: InviteCode[];
  stats: {
    invitesAvailable: number;
    invitesIssued: number;
    invitesActivated: number;
    nextGrantAt: string | null;
  };
};

function isLocalDemoMode() {
  return isLocalAuthBypassEnabled();
}

const LOCAL_DEMO_ME: MatchMeResponse = {
  profile: {
    id: 'local-profile-me',
    role: 'SELLER',
    roleCustom: null,
    displayName: 'Локальный Тестер',
    headline: 'Проверяю Match на локалке',
    bio: 'Этот профиль создается только для локального demo режима.',
    experience: 3,
    city: 'Москва',
    birthDate: null,
    zodiacSign: null,
    workFormats: ['REMOTE'],
    marketplaces: ['WB'],
    marketplacesCustom: null,
    niches: ['demo'],
    skills: ['demo'],
    tools: ['mpstats', 'figma', 'notion'],
    priceMin: 2000,
    priceMax: 4000,
    currency: 'RUB',
    avatarUrl:
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=1200&auto=format&fit=crop',
    photos: [],
    portfolioUrl: null,
    telegramContact: '@local_demo',
    isActive: true,
    pausedUntil: null,
    lastSwipeResetAt: null,
    swipeStreakDays: 4,
    superLikeBalance: 3,
  },
  settings: {
    id: 'local-settings',
    profileId: 'local-profile-me',
    interestedRoles: [],
    interestedWorkFormats: [],
    sameCityOnly: false,
    interestedMarketplaces: [],
    interestedNiches: [],
    experienceMin: null,
    experienceMax: null,
    photoPreference: 'ANY',
    hideFromFeed: false,
  },
  streak: { current: 4, nextRewardAt: Date.now() + 86_400_000 },
  superLikeBalance: 3,
  pendingLikeCount: 0,
  likeCountToday: 2,
  likeLimitPerDay: 35,
  invites: { available: 5, issued: 0, activated: 0, nextGrantAt: null },
  isAdmin: true,
  featureInviteOnly: false,
  autoResetEnabled: true,
  lastResetTriggeredBy: null,
  lastResetDeletedCount: 0,
  activity: {
    quadrant: 'SELECTIVE',
    likesSent14d: 7,
    likesReceived14d: 12,
    matches14d: 2,
    activityScore: 0.25,
    reciprocityScore: 0.22,
    scoreUpdatedAt: new Date().toISOString(),
    accountAgeDays: 21,
  },
};

const LOCAL_DEMO_FEED: FeedCard[] = [
  {
    id: 'local-feed-1',
    role: 'DESIGNER',
    roleCustom: null,
    roleLabel: 'Дизайнер',
    displayName: 'Екатерина Лебедева',
    headline: 'Делаю карточки с высоким CTR',
    bio: 'Фокус: инфографика и A/B тесты для маркетплейсов.',
    experience: 4,
    city: 'Санкт-Петербург',
    birthDate: null,
    zodiacSign: null,
    workFormats: ['REMOTE'],
    marketplaces: ['WB', 'OZON'],
    marketplacesCustom: null,
    niches: ['косметика', 'товары для дома'],
    skills: ['figma', 'инфографика', 'ab тесты'],
    tools: ['Figma', 'Photoshop', 'Canva'],
    priceMin: 1500,
    priceMax: 3500,
    currency: 'RUB',
    avatarUrl:
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
    photos: [],
    portfolioUrl: 'https://example.com/designer-portfolio',
    telegramContact: null,
    isActive: true,
  },
  {
    id: 'local-feed-2',
    role: 'AD_BUYER',
    roleCustom: null,
    roleLabel: 'Трафик-менеджер',
    displayName: 'Илья Соколов',
    headline: 'Привожу лиды через Telegram Ads',
    bio: 'Настраиваю и масштабирую трафик под ROMI.',
    experience: 8,
    city: 'Казань',
    birthDate: null,
    zodiacSign: null,
    workFormats: ['REMOTE', 'HYBRID'],
    marketplaces: ['WB', 'OZON', 'YANDEX_MARKET'],
    marketplacesCustom: null,
    niches: ['электроника'],
    skills: ['telegram ads', 'аналитика', 'медиаплан'],
    tools: ['Keitaro', 'Google Sheets', 'Looker Studio'],
    priceMin: 3000,
    priceMax: 7000,
    currency: 'RUB',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1200&auto=format&fit=crop',
    photos: [],
    portfolioUrl: null,
    telegramContact: null,
    isActive: true,
  },
  {
    id: 'local-feed-3',
    role: 'SELLER',
    roleCustom: null,
    roleLabel: 'Селлер',
    displayName: 'Марина Орлова',
    headline: 'Ищу операционного менеджера',
    bio: 'Масштабирую бренд на WB, нужна команда.',
    experience: 6,
    city: 'Москва',
    birthDate: null,
    zodiacSign: null,
    workFormats: ['REMOTE'],
    marketplaces: ['WB'],
    marketplacesCustom: null,
    niches: ['одежда'],
    skills: ['запуск sku', 'unit экономика'],
    tools: ['MPStats', 'МойСклад', 'Excel'],
    priceMin: 2500,
    priceMax: 6000,
    currency: 'RUB',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1200&auto=format&fit=crop',
    photos: [],
    portfolioUrl: null,
    telegramContact: null,
    isActive: true,
  },
];

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const LOCAL_DEMO_MESSAGES: Record<string, MatchMessage[]> = {
  'local-pair-1': [
    {
      id: 'local-msg-1',
      pairId: 'local-pair-1',
      senderProfileId: 'local-feed-2',
      body: 'Привет! Могу взять рекламу и аналитику. Удобно созвониться сегодня?',
      createdAt: isoMinutesAgo(22),
      systemGenerated: false,
    },
    {
      id: 'local-msg-2',
      pairId: 'local-pair-1',
      senderProfileId: 'local-profile-me',
      body: 'Да, отлично. Давай после 18:00, пришлю вводные по проекту.',
      createdAt: isoMinutesAgo(18),
      systemGenerated: false,
    },
    {
      id: 'local-msg-3',
      pairId: 'local-pair-1',
      senderProfileId: 'local-feed-2',
      body: 'Супер, жду. Можем сразу обсудить медиаплан на неделю.',
      createdAt: isoMinutesAgo(12),
      systemGenerated: false,
    },
  ],
  'local-pair-2': [
    {
      id: 'local-msg-4',
      pairId: 'local-pair-2',
      senderProfileId: 'system',
      body: 'У вас новый матч! Начните диалог 👋',
      createdAt: isoMinutesAgo(90),
      systemGenerated: true,
    },
  ],
};

let LOCAL_DEMO_PAIRS: MatchPair[] = [
  {
    id: 'local-pair-1',
    createdAt: isoMinutesAgo(60),
    lastMessageAt: isoMinutesAgo(12),
    hasUnread: true,
    unreadCount: 1,
    isFirstMessageSystemOnly: false,
    isArchived: false,
    partner: {
      id: 'local-feed-2',
      displayName: 'Илья Соколов',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1200&auto=format&fit=crop',
      role: 'AD_BUYER',
      roleCustom: null,
      niches: ['электроника'],
    },
    lastMessage: {
      id: 'local-msg-3',
      body: 'Супер, жду. Можем сразу обсудить медиаплан на неделю.',
      createdAt: isoMinutesAgo(12),
      senderProfileId: 'local-feed-2',
      systemGenerated: false,
    },
  },
  {
    id: 'local-pair-2',
    createdAt: isoMinutesAgo(90),
    lastMessageAt: isoMinutesAgo(90),
    hasUnread: false,
    unreadCount: 0,
    isFirstMessageSystemOnly: true,
    isArchived: false,
    partner: {
      id: 'local-feed-1',
      displayName: 'Екатерина Лебедева',
      avatarUrl:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop',
      role: 'DESIGNER',
      roleCustom: null,
      niches: ['косметика', 'товары для дома'],
    },
    lastMessage: {
      id: 'local-msg-4',
      body: 'У вас новый матч! Начните диалог 👋',
      createdAt: isoMinutesAgo(90),
      senderProfileId: 'system',
      systemGenerated: true,
    },
  },
];

function sortLocalPairs(pairs: MatchPair[]): MatchPair[] {
  return pairs
    .slice()
    .sort((a, b) => {
      const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime();
      const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime();
      return bTs - aTs;
    });
}

function getLocalPair(pairId: string): MatchPair | undefined {
  return LOCAL_DEMO_PAIRS.find((pair) => pair.id === pairId);
}

function syncLocalPairFromMessages(pairId: string): void {
  const messages = LOCAL_DEMO_MESSAGES[pairId] ?? [];
  const pair = getLocalPair(pairId);
  if (!pair) return;
  const last = messages[messages.length - 1] ?? null;
  pair.lastMessage = last
    ? {
        id: last.id,
        body: last.body,
        createdAt: last.createdAt,
        senderProfileId: last.senderProfileId,
        systemGenerated: last.systemGenerated,
      }
    : null;
  pair.lastMessageAt = last?.createdAt ?? pair.createdAt;
  pair.isFirstMessageSystemOnly = messages.length === 1 && Boolean(last?.systemGenerated);
}

function ensureLocalPairForProfile(profileId: string): MatchPair | null {
  const existing = LOCAL_DEMO_PAIRS.find((pair) => pair.partner?.id === profileId);
  if (existing) return existing;
  const partner = LOCAL_DEMO_FEED.find((card) => card.id === profileId);
  if (!partner) return null;
  const pairId = `local-pair-${profileId}`;
  const createdAt = new Date().toISOString();
  LOCAL_DEMO_MESSAGES[pairId] = [
    {
      id: `local-msg-system-${pairId}`,
      pairId,
      senderProfileId: 'system',
      body: 'У вас новый матч! Напишите первым 👋',
      createdAt,
      systemGenerated: true,
    },
  ];
  const pair: MatchPair = {
    id: pairId,
    createdAt,
    lastMessageAt: createdAt,
    hasUnread: false,
    unreadCount: 0,
    isFirstMessageSystemOnly: true,
    isArchived: false,
    partner: {
      id: partner.id,
      displayName: partner.displayName,
      avatarUrl: partner.avatarUrl,
      role: partner.role,
      roleCustom: partner.roleCustom,
      niches: partner.niches,
    },
    lastMessage: {
      id: `local-msg-system-${pairId}`,
      body: 'У вас новый матч! Напишите первым 👋',
      createdAt,
      senderProfileId: 'system',
      systemGenerated: true,
    },
  };
  LOCAL_DEMO_PAIRS = [pair, ...LOCAL_DEMO_PAIRS];
  return pair;
}

export const matchApi = {
  auth(initData: string) {
    if (isLocalDemoMode()) {
      return Promise.resolve({
        token: LOCAL_DEV_TOKEN,
        profileId: LOCAL_DEMO_ME.profile?.id ?? null,
      });
    }
    return matchFetch<{ token: string; profileId: string | null }>('/match-api/auth', {
      method: 'POST',
      body: JSON.stringify({ initData }),
      auth: false,
    });
  },
  me() {
    if (isLocalDemoMode()) {
      return Promise.resolve(LOCAL_DEMO_ME);
    }
    return matchFetch<MatchMeResponse>('/match-api/me');
  },
  upsertProfile(payload: Record<string, unknown>) {
    return matchFetch<MatchMeResponse>('/match-api/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSettings() {
    return matchFetch<MatchSettings>('/match-api/settings');
  },
  saveSettings(payload: Record<string, unknown>) {
    return matchFetch<MatchSettings>('/match-api/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  feed(limit = 20, offset = 0) {
    if (isLocalDemoMode()) {
      const available = LOCAL_DEMO_FEED.filter((card) => !localSwipedIds.has(card.id));
      const items = available.slice(offset, offset + limit);
      return Promise.resolve({
        items,
        hasMore: offset + items.length < available.length,
        nextOffset:
          offset + items.length < available.length ? offset + items.length : null,
      } satisfies FeedPage);
    }
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (offset > 0) params.set('offset', String(offset));
    return matchFetch<FeedPage>(`/match-api/feed?${params.toString()}`);
  },
  swipe(
    toProfileId: string,
    direction: 'LIKE' | 'PASS',
  ): Promise<{
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
  }> {
    if (isLocalDemoMode()) {
      localSwipeHistory.push(toProfileId);
      localSwipedIds.add(toProfileId);
      const matched = direction === 'LIKE' && toProfileId === 'local-feed-2';
      const pair = matched ? ensureLocalPairForProfile(toProfileId) : null;
      return Promise.resolve({
        matched,
        pairId: pair?.id,
        partner: pair?.partner
          ? {
              id: pair.partner.id,
              displayName: pair.partner.displayName,
              avatarUrl: pair.partner.avatarUrl,
              role: pair.partner.role,
              roleCustom: pair.partner.roleCustom,
            }
          : undefined,
      });
    }
    return matchFetch<{
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
    if (isLocalDemoMode()) {
      const last = localSwipeHistory.pop();
      if (last) localSwipedIds.delete(last);
      return Promise.resolve({ undone: Boolean(last) });
    }
    return matchFetch<{ undone: boolean }>('/match-api/swipe/undo', { method: 'POST' });
  },
  swipeResetPreview(): Promise<SwipeResetPreview> {
    if (isLocalDemoMode()) {
      return Promise.resolve({
        canReset: localSwipedIds.size > 0,
        resettableCount: localSwipedIds.size,
        nextAvailableAt: null,
        autoResetEnabled: true,
        nextAutoResetAt: null,
      });
    }
    return matchFetch<SwipeResetPreview>('/match-api/swipe/reset/preview');
  },
  resetSwipe() {
    if (isLocalDemoMode()) {
      const deletedCount = localSwipedIds.size;
      localSwipedIds.clear();
      localSwipeHistory.length = 0;
      return Promise.resolve({ deletedCount });
    }
    return matchFetch<{ deletedCount: number }>('/match-api/swipe/reset', {
      method: 'POST',
    });
  },
  pause(days?: number) {
    return matchFetch<{ id: string; pausedUntil: string | null }>('/match-api/pause', {
      method: 'POST',
      body: JSON.stringify(days ? { days } : {}),
    });
  },
  invites() {
    return matchFetch<InviteListResponse>('/match-api/invites');
  },
  revokeInvite(code: string) {
    return matchFetch<{ ok: boolean }>('/match-api/invites/revoke', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },
  adminIssueInvites(payload: { count: number; ownerProfileId?: string }) {
    return matchFetch('/match-api/admin/invites', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  matches() {
    if (isLocalDemoMode()) {
      return Promise.resolve(sortLocalPairs(LOCAL_DEMO_PAIRS));
    }
    return matchFetch<MatchPair[]>('/match-api/matches');
  },
  matchPartner(pairId: string) {
    if (isLocalDemoMode()) {
      const pair = LOCAL_DEMO_PAIRS.find((item) => item.id === pairId);
      const partnerId = pair?.partner?.id;
      const partner = LOCAL_DEMO_FEED.find((item) => item.id === partnerId);
      if (!partner) {
        return Promise.reject(new Error('Partner not found'));
      }
      return Promise.resolve(partner);
    }
    return matchFetch<MatchPartnerProfile>(`/match-api/matches/${pairId}/partner`);
  },
  photos() {
    return matchFetch<Array<{ id: string; url: string; order: number }>>(
      '/match-api/photos',
    );
  },
  async uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return matchFetch<{ id: string; url: string; order: number }>('/match-api/photos', {
      method: 'POST',
      body: formData,
    });
  },
  deletePhoto(photoId: string) {
    return matchFetch<{ ok: boolean }>(`/match-api/photos/${photoId}`, {
      method: 'DELETE',
    });
  },
  reorderPhotos(order: string[]) {
    return matchFetch<Array<{ id: string; url: string; order: number }>>(
      '/match-api/photos/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ order }),
      },
    );
  },
  messages(pairId: string) {
    if (isLocalDemoMode()) {
      return Promise.resolve((LOCAL_DEMO_MESSAGES[pairId] ?? []).slice());
    }
    return matchFetch<MatchMessage[]>(`/match-api/matches/${pairId}/messages`);
  },
  sendMessage(pairId: string, body: string) {
    if (isLocalDemoMode()) {
      const message: MatchMessage = {
        id: `local-msg-${Date.now()}`,
        pairId,
        senderProfileId: LOCAL_DEMO_ME.profile?.id ?? 'local-profile-me',
        body,
        createdAt: new Date().toISOString(),
        systemGenerated: false,
      };
      LOCAL_DEMO_MESSAGES[pairId] = [...(LOCAL_DEMO_MESSAGES[pairId] ?? []), message];
      syncLocalPairFromMessages(pairId);
      const pair = getLocalPair(pairId);
      if (pair) {
        pair.hasUnread = false;
        pair.unreadCount = 0;
      }
      return Promise.resolve(message);
    }
    return matchFetch<MatchMessage>(`/match-api/matches/${pairId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  markPairRead(pairId: string) {
    if (isLocalDemoMode()) {
      const pair = getLocalPair(pairId);
      if (pair) {
        pair.hasUnread = false;
        pair.unreadCount = 0;
      }
      return Promise.resolve({ ok: true });
    }
    return matchFetch<{ ok: boolean }>(`/match-api/matches/${pairId}/read`, {
      method: 'POST',
    });
  },
  archivePair(pairId: string) {
    if (isLocalDemoMode()) {
      const pair = getLocalPair(pairId);
      if (pair) pair.isArchived = true;
      return Promise.resolve({ ok: true });
    }
    return matchFetch<{ ok: boolean }>(`/match-api/matches/${pairId}/archive`, {
      method: 'POST',
    });
  },
  unarchivePair(pairId: string) {
    if (isLocalDemoMode()) {
      const pair = getLocalPair(pairId);
      if (pair) pair.isArchived = false;
      return Promise.resolve({ ok: true });
    }
    return matchFetch<{ ok: boolean }>(`/match-api/matches/${pairId}/unarchive`, {
      method: 'POST',
    });
  },
  favorites() {
    return matchFetch<FavoriteItem[]>('/match-api/favorites');
  },
  removeFavorite(toProfileId: string) {
    return matchFetch<{ ok: boolean; removed: number }>(
      `/match-api/favorites/${toProfileId}`,
      { method: 'DELETE' },
    );
  },
};

export type FavoriteItem = {
  swipeId: string;
  likedAt: string;
  isSuperLike: boolean;
  partner: {
    id: string;
    displayName: string;
    role: string;
    roleCustom: string | null;
    headline: string | null;
    city: string | null;
    niches: string[];
    avatarUrl: string | null;
    isAvailable: boolean;
  };
};
