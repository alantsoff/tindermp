'use client';

import { useAdminLive } from '../_lib/queries';

export default function MatchAdminLivePage() {
  const { data, isLoading } = useAdminLive();
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="font-semibold">Live events (polling)</h2>
      <p className="text-xs text-zinc-500">Автообновление каждые 5 секунд.</p>
      <pre className="mt-3 max-h-[700px] overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
        {isLoading ? 'Загрузка...' : JSON.stringify(data ?? [], null, 2)}
      </pre>
    </div>
  );
}
