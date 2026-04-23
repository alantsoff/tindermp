'use client';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        MainButton?: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        };
      };
    };
  }
}

const LOCAL_DEV_INIT_DATA = 'local-dev-auth';

export function isLocalAuthBypassEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS?.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function setupMiniApp(): void {
  if (typeof window === 'undefined') return;
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
}

export function getInitData(): string {
  if (typeof window === 'undefined') return '';
  return window.Telegram?.WebApp?.initData?.trim() ?? '';
}

export function getInitDataForAuth(): string {
  const initData = getInitData();
  if (initData) return initData;
  if (isLocalAuthBypassEnabled()) return LOCAL_DEV_INIT_DATA;
  return '';
}

/**
 * Telegram-SDK инжектит `window.Telegram.WebApp.initData` асинхронно
 * (после `ready()` и первой отрисовки), поэтому синхронный `getInitData()`
 * сразу после монтирования может вернуть пусто. Эта функция опрашивает
 * объект с небольшим шагом, пока не появится initData или не истечёт
 * таймаут. Используется и при первичной авторизации (MatchBootstrap),
 * и при повторной авторизации после 401 в matchFetch.
 */
export async function waitForInitData(
  timeoutMs = 5_000,
  pollIntervalMs = 200,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  // Если мы в dev-режиме (localhost / NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS) —
  // возвращаем sentinel initData сразу, бэк опознает её как bypass.
  const immediate = getInitDataForAuth();
  if (immediate) return immediate;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const value = getInitDataForAuth();
    if (value) return value;
  }
  return '';
}

/**
 * Различает: (a) мини-апп открыт НЕ из Telegram (браузер / превью /
 * старый клиент) — initData никогда не приходила; (b) initData была,
 * но в какой-то момент пропала (например, WebView перешёл в background
 * и клиент её не перевыпустил). Нужно для более точного UX-сообщения.
 */
export function hasTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Telegram?.WebApp);
}

export function getTelegramStartParam(): string {
  const initData = getInitData();
  if (!initData) return '';
  const params = new URLSearchParams(initData);
  return params.get('start_param')?.trim() ?? '';
}

export function getInviteCodeFromStartParam(startParamRaw: string): string | null {
  const value = startParamRaw.trim();
  if (!value) return null;
  if (value.startsWith('invite_')) {
    return value.slice('invite_'.length).trim().toUpperCase();
  }
  if (value.startsWith('invite-')) {
    return value.slice('invite-'.length).trim().toUpperCase();
  }
  return null;
}

type TelegramInitUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

export function getTelegramInitUser(): TelegramInitUser | null {
  const initData = getInitData();
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const rawUser = params.get('user');
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as TelegramInitUser;
  } catch {
    return null;
  }
}

export function getTelegramPhotoUrl(): string | null {
  const user = getTelegramInitUser();
  const value = user?.photo_url?.trim();
  return value || null;
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof window === 'undefined') return;
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: 'success' | 'warning' | 'error') {
  if (typeof window === 'undefined') return;
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}

export function showMainButton(text: string): void {
  if (typeof window === 'undefined') return;
  const button = window.Telegram?.WebApp?.MainButton;
  if (!button) return;
  button.setText(text);
  button.show();
}

export function hideMainButton(): void {
  if (typeof window === 'undefined') return;
  window.Telegram?.WebApp?.MainButton?.hide();
}
