'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  matchApi,
  setMatchToken,
  MatchAuthError,
  AUTH_ERROR_NO_TELEGRAM,
  AUTH_ERROR_INIT_DATA_LOST,
} from '../_lib/api';
import {
  getInviteCodeFromStartParam,
  getTelegramStartParam,
  hasTelegramWebApp,
  setupMiniApp,
  waitForInitData,
} from '../_lib/telegram';

type AuthFailure = {
  title: string;
  hint: string;
  canReload: boolean;
};

function classifyAuthError(e: unknown): AuthFailure {
  if (e instanceof MatchAuthError) {
    if (e.code === AUTH_ERROR_INIT_DATA_LOST) {
      return {
        title: 'Сессия Telegram истекла',
        hint: 'Закройте мини-приложение и откройте его из Telegram заново.',
        canReload: true,
      };
    }
    return {
      title: 'Запуск не из Telegram',
      hint: 'Откройте приложение через бота @tindermp_bot — в обычном браузере авторизация невозможна.',
      canReload: false,
    };
  }
  // Fallback: если initData есть, но отвалилось что-то внутри auth/me,
  // разделяем "сеть/сервер" и "телеграм" по наличию WebApp.
  if (!hasTelegramWebApp()) {
    return {
      title: 'Запуск не из Telegram',
      hint: 'Откройте приложение через бота @tindermp_bot.',
      canReload: false,
    };
  }
  const message = e instanceof Error ? e.message : 'Не удалось авторизоваться';
  return {
    title: 'Не удалось авторизоваться',
    hint: message,
    canReload: true,
  };
}

export function MatchBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  useEffect(() => {
    let mounted = true;
    setupMiniApp();

    const run = async () => {
      try {
        // Ждём initData до 5 секунд — Telegram SDK инжектит её после ready().
        const initData = await waitForInitData(5_000);
        if (!initData) {
          throw new MatchAuthError(
            hasTelegramWebApp()
              ? AUTH_ERROR_INIT_DATA_LOST
              : AUTH_ERROR_NO_TELEGRAM,
            'initData недоступна',
          );
        }
        const auth = await matchApi.auth(initData);
        setMatchToken(auth.token);
        if (!mounted) return;

        const inviteCodeFromQuery = searchParams.get('invite')?.trim().toUpperCase();
        const inviteCodeFromStartParam = getInviteCodeFromStartParam(
          getTelegramStartParam(),
        );
        const inviteCode = inviteCodeFromQuery ?? inviteCodeFromStartParam;
        if (inviteCode && typeof window !== 'undefined') {
          window.sessionStorage.setItem('matchInviteCode', inviteCode);
        }

        const pairId = searchParams.get('pair')?.trim();
        const me = await matchApi.me();
        const hasProfile = !!me.profile;
        if (hasProfile) {
          if (pairId) {
            router.replace(`/m/matches/${pairId}`);
          } else {
            router.replace('/m/feed');
          }
        } else {
          if (me.isAdmin) {
            router.replace('/m/onboarding');
          } else {
            router.replace('/m/invite');
          }
        }
      } catch (e) {
        if (!mounted) return;
        setFailure(classifyAuthError(e));
      }
    };
    void run();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      {!failure ? (
        <>
          <div className="ios-spinner" aria-label="Загрузка" />
          <div className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.75)]">
            Инициализируем Match…
          </div>
        </>
      ) : (
        <div
          className="glass-ultra-thin mt-2 flex max-w-[320px] flex-col items-center gap-2 rounded-2xl border px-4 py-3 text-[13px]"
          style={{
            color: 'rgb(var(--ios-red))',
            borderColor: 'rgb(var(--ios-red) / 0.3)',
          }}
          role="alert"
        >
          <div className="font-semibold">{failure.title}</div>
          <div
            className="text-[12.5px] leading-[1.35]"
            style={{ color: 'rgb(var(--ios-label-secondary))' }}
          >
            {failure.hint}
          </div>
          {failure.canReload ? (
            <button
              type="button"
              className="ios-btn-primary mt-1 text-[13px]"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            >
              Перезагрузить
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
