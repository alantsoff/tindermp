'use client';

import { useState } from 'react';
import { matchAdminApi } from '../_lib/api';
import { useAdminSpam } from '../_lib/queries';

export default function MatchAdminSpamPage() {
  const [minScore, setMinScore] = useState(40);
  const { data, isLoading, refetch } = useAdminSpam(minScore);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-3">
        <label className="text-sm text-ios-label-secondary">minScore</label>
        <input
          type="number"
          min={0}
          max={100}
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          className="w-24 rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-2 py-1.5 text-sm text-ios-label focus:border-ios-purple focus:outline-none"
        />
        <button
          className="rounded-lg border border-[rgb(var(--hairline-strong))] px-3 py-1.5 text-sm text-ios-label-secondary hover:bg-[rgb(var(--ios-fill-1)/0.12)]"
          onClick={() => refetch()}
        >
          Обновить
        </button>
        <button
          className="rounded-lg bg-ios-purple px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          onClick={async () => {
            await matchAdminApi.recomputeSpam();
            await refetch();
          }}
        >
          Пересчитать всех
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ios-inset text-ios-label-secondary">
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
                <td className="px-3 py-3 text-ios-label-tertiary" colSpan={5}>
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
                    ? 'text-ios-red'
                    : item.suspicionScore >= 40
                      ? 'text-ios-orange'
                      : 'text-ios-green';
                return (
                  <tr key={item.profileId} className="border-t border-[rgb(var(--hairline))] align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{profile?.displayName ?? '—'}</p>
                      <p className="text-xs text-ios-label-tertiary">{profile?.id ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2">{profile?.role ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${color}`}>
                      {item.suspicionScore}
                    </td>
                    <td className="px-3 py-2 text-xs text-ios-label-secondary">
                      likeRate={item.likeRateRecent ?? '—'}; peak={item.swipesPerMinutePeak ?? '—'};
                      dup={item.duplicateFirstMsgCount ?? 0}; burst={String(item.invitedBurstFlag)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ios-label-secondary">
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
