'use client';

import { useState } from 'react';
import { matchAdminApi } from '../_lib/api';
import { useAdminSpam } from '../_lib/queries';

export default function MatchAdminSpamPage() {
  const [minScore, setMinScore] = useState(40);
  const { data, isLoading, refetch } = useAdminSpam(minScore);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <label className="text-sm text-zinc-400">minScore</label>
        <input
          type="number"
          min={0}
          max={100}
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
        />
        <button
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm"
          onClick={() => refetch()}
        >
          Обновить
        </button>
        <button
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm"
          onClick={async () => {
            await matchAdminApi.recomputeSpam();
            await refetch();
          }}
        >
          Пересчитать всех
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Профиль</th>
              <th className="px-3 py-2 text-left">Роль</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-left">Signals</th>
              <th className="px-3 py-2 text-left">Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                  Загрузка...
                </td>
              </tr>
            ) : (
              (data ?? []).map((raw) => {
                const item = raw as {
                  profileId: string;
                  suspicionScore: number;
                  likeRateRecent?: number | null;
                  swipesPerMinutePeak?: number | null;
                  duplicateFirstMsgCount?: number | null;
                  invitedBurstFlag?: boolean;
                  profile?: {
                    id: string;
                    displayName: string;
                    role: string;
                    bannedAt?: string | null;
                    shadowBanned?: boolean;
                  } | null;
                };
                const profile = item.profile ?? null;
                const color =
                  item.suspicionScore >= 60
                    ? 'text-red-300'
                    : item.suspicionScore >= 40
                      ? 'text-amber-300'
                      : 'text-emerald-300';
                return (
                  <tr key={item.profileId} className="border-t border-zinc-800 align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{profile?.displayName ?? '—'}</p>
                      <p className="text-xs text-zinc-500">{profile?.id ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2">{profile?.role ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${color}`}>
                      {item.suspicionScore}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      likeRate={item.likeRateRecent ?? '—'}; peak={item.swipesPerMinutePeak ?? '—'};
                      dup={item.duplicateFirstMsgCount ?? 0}; burst={String(item.invitedBurstFlag)}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {profile?.bannedAt ? 'banned' : profile?.shadowBanned ? 'shadow' : 'ok'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
