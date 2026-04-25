 'use client';

import Script from 'next/script';
import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BottomTabs } from './_components/BottomTabs';

function ViewTransitions({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    if (typeof doc.startViewTransition === 'function') {
      // Marker hook for browsers with View Transitions support.
      // Actual transitions are triggered on navigation handlers.
    }
  }, [pathname]);
  return <>{children}</>;
}

export default function MatchLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-[100dvh] text-ios-label"
      style={{ minHeight: 'var(--tg-viewport-stable-height, 100dvh)' }}
    >
      {/*
        Self-hosted Telegram WebApp SDK + CDN fallback.

        Зачем self-host: некоторые юзерские прокси/VPN/ISP блокируют
        telegram.org — внутри Telegram WebView SDK не загружается,
        window.Telegram.WebApp не появляется, и юзер видит ложное
        «Запуск не из Telegram» (см. apps/web/public/vendor/README.md).

        Используем strategy="beforeInteractive" — Next.js встроит скрипт
        в начало <head>, до hydration: это даёт SDK максимум времени
        проинициализироваться к моменту первого рендера.

        Второй <Script> с CDN — fallback. Если плейсхолдер ещё не заменён
        на реальный файл (см. vendor/README.md), CDN всё равно подгрузит
        SDK, и приложение будет работать как раньше. Если CDN заблокирован
        — локальный файл (после замены плейсхолдера) спасёт юзера.
      */}
      <Script
        src="/vendor/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />
      <div
        className="mx-auto min-h-[100dvh] max-w-[430px] px-4"
        style={{
          minHeight: 'var(--tg-viewport-stable-height, 100dvh)',
          paddingTop:
            'max(env(safe-area-inset-top), var(--tg-safe-area-inset-top, 0px), 52px)',
          paddingBottom:
            'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 124px)',
        }}
      >
        <ViewTransitions>{children}</ViewTransitions>
      </div>
      <BottomTabs />
    </div>
  );
}
