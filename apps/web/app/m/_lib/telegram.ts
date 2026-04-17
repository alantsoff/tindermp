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

export function setupMiniApp(): void {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
}

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData?.trim() ?? '';
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotification(type: 'success' | 'warning' | 'error') {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}

export function showMainButton(text: string): void {
  const button = window.Telegram?.WebApp?.MainButton;
  if (!button) return;
  button.setText(text);
  button.show();
}

export function hideMainButton(): void {
  window.Telegram?.WebApp?.MainButton?.hide();
}
