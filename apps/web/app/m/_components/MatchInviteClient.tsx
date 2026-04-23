'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';

// Поддерживаем два формата:
//  - старый 4-4 (уже выпущенные коды в БД, длина 9 с дефисом)
//  - новый 5-5 (с апреля 2026, длина 11 с дефисом, 32^10 ≈ 1.1e15 энтропии)
// Разбиваем пополам по количеству введённых буквоцифр.
function normalizeInviteCode(value: string): string {
  const raw = value.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  const MAX = 10;
  const trimmed = raw.slice(0, MAX);
  if (trimmed.length <= 5) return trimmed;
  // Если пользователь ввёл ровно 8 символов — считаем это старым форматом 4-4.
  const half = trimmed.length === 8 ? 4 : Math.ceil(trimmed.length / 2);
  return `${trimmed.slice(0, half)}-${trimmed.slice(half)}`;
}

const VALID_CODE_LENGTHS = new Set([9, 11]); // "XXXX-XXXX" и "XXXXX-XXXXX"

export function MatchInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState(() => {
    const fromUrl = searchParams.get('invite');
    const fromStorage =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem('matchInviteCode')
        : null;
    return normalizeInviteCode(fromUrl ?? fromStorage ?? '');
  });
  const [error, setError] = useState<string | null>(null);

  // Pick up "invite already used / revoked" message left by onboarding
  // when it redirected back here. Deferred to a microtask so that the
  // set-state happens outside of the effect's sync phase (lint rule).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled || typeof window === 'undefined') return;
      const stored = window.sessionStorage.getItem('matchInviteError');
      if (stored) {
        setError(stored);
        window.sessionStorage.removeItem('matchInviteError');
        window.sessionStorage.removeItem('matchInviteCode');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeInviteCode(inviteCode);
    if (!VALID_CODE_LENGTHS.has(code.length)) {
      setError('Введите корректный код в формате XXXXX-XXXXX');
      return;
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('matchInviteCode', code);
    }
    router.push(`/m/onboarding?invite=${encodeURIComponent(code)}`);
  };

  return (
    <div className="flex min-h-[80svh] flex-col items-center justify-center py-8">
      <div className="glass glass-edge w-full rounded-[28px] p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--ios-tint)), rgb(var(--ios-purple)))',
            boxShadow: '0 14px 36px -12px rgb(var(--ios-tint) / 0.55)',
          }}
        >
          <Sparkles size={24} className="text-white" strokeWidth={2.4} />
        </div>
        <h1 className="ios-title tracking-tight">Match — по приглашению</h1>
        <p className="mt-1 text-[14px] text-[rgb(var(--ios-label-secondary)/0.85)]">
          Введите инвайт-код
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-3 text-left">
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
            placeholder="XXXXX-XXXXX"
            autoCapitalize="characters"
            inputMode="text"
            className="ios-input text-center text-[22px] font-semibold tracking-[0.3em]"
          />
          {error ? (
            <p
              className="text-center text-[13px]"
              style={{ color: 'rgb(var(--ios-red))' }}
            >
              {error}
            </p>
          ) : null}
          <button type="submit" className="ios-btn-primary w-full">
            Продолжить
          </button>
        </form>
        <p className="mt-4 text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
          Нет кода? Приложение работает только по приглашению. Попросите код у
          знакомого, который уже внутри.
        </p>
      </div>
    </div>
  );
}
