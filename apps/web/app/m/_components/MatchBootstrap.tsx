'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { matchApi, setMatchToken } from '../_lib/api';
import { getInitData, setupMiniApp } from '../_lib/telegram';

export function MatchBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setupMiniApp();

    const run = async () => {
      try {
        const initData = getInitData();
        if (!initData) {
          throw new Error('Mini App нужно открыть из Telegram (нет initData).');
        }
        const auth = await matchApi.auth(initData);
        setMatchToken(auth.token);
        if (!mounted) return;

        const pairId = searchParams.get('pair')?.trim();
        if (auth.profileId) {
          if (pairId) {
            router.replace(`/m/matches/${pairId}`);
          } else {
            router.replace('/m/feed');
          }
        } else {
          router.replace('/m/onboarding');
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Не удалось авторизоваться');
      }
    };
    void run();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center text-center">
      <div>
        <div className="mb-3 text-sm text-zinc-400">Инициализируем Match…</div>
        {error ? <div className="text-sm text-red-400">{error}</div> : null}
      </div>
    </div>
  );
}
