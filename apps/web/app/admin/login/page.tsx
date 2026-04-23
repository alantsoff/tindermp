'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { matchAdminApi, setAdminToken } from '../match/_lib/api';

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
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <h1 className="text-xl font-semibold">Вход в Match Admin</h1>
        <p className="text-sm text-zinc-400">
          Введите Telegram ID админа и пароль панели.
        </p>
        <input
          value={telegramId}
          onChange={(event) => setTelegramId(event.target.value)}
          placeholder="Telegram ID (например 123456789)"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль админки"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? 'Входим...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
