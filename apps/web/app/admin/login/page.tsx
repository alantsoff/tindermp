'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { matchAdminApi, setAdminToken } from '../match/_lib/api';

const INPUT_CLASS =
  'w-full rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none';

export default function MatchAdminLoginPage() {
  const router = useRouter();
  const [telegramId, setTelegramId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await matchAdminApi.login(telegramId, password);
      setAdminToken(result.token);
      router.replace('/admin/match');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 text-ios-label">
      <form
        onSubmit={onSubmit}
        className="w-full space-y-3 rounded-2xl border border-[rgb(var(--hairline))] bg-ios-elevated p-5"
      >
        <h1 className="text-xl font-semibold">Вход в Match Admin</h1>
        <p className="text-sm text-ios-label-secondary">
          Введите Telegram ID админа и пароль панели.
        </p>
        <input
          value={telegramId}
          onChange={(event) => setTelegramId(event.target.value)}
          placeholder="Telegram ID (например 123456789)"
          className={INPUT_CLASS}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль админки"
          className={INPUT_CLASS}
        />
        {error ? <p className="text-sm text-ios-red">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-ios-purple px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
