'use client';

import { useAdminLive } from '../_lib/queries';

export default function MatchAdminLivePage() {
  const { data, isLoading } = useAdminLive();
  return (
    <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
      <h2 className="font-semibold">Live events (polling)</h2>
      <p className="text-xs text-ios-label-tertiary">Автообновление каждые 5 секунд.</p>
      <pre className="mt-3 max-h-[700px] overflow-auto rounded bg-ios-inset p-3 text-xs text-ios-label-secondary">
        {isLoading ? 'Загрузка...' : JSON.stringify(data ?? [], null, 2)}
      </pre>
    </div>
  );
}
