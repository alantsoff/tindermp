'use client';

import Link from 'next/link';
import { useMatches } from '../_lib/queries';

export default function MatchesPage() {
  const { data, isLoading } = useMatches();

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-zinc-400">Загружаем матчи…</div>;
  }

  if (!data?.length) {
    return <div className="py-20 text-center text-sm text-zinc-400">Пока нет матчей.</div>;
  }

  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Матчи</h1>
      <div className="space-y-2">
        {data.map((pair) => (
          <Link
            key={pair.id}
            href={`/m/matches/${pair.id}`}
            className="block rounded-xl border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="mb-1 text-sm font-medium text-zinc-100">{pair.partner?.displayName ?? 'Собеседник'}</div>
            <div className="line-clamp-1 text-xs text-zinc-400">{pair.lastMessage?.body ?? 'Напишите первым'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
