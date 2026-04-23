'use client';

import Link from 'next/link';
import { useAdminOverview } from './_lib/queries';

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString('ru-RU')}</p>
    </div>
  );
}

export default function MatchAdminDashboardPage() {
  const { data, isLoading } = useAdminOverview();

  if (isLoading) {
    return <div className="text-sm text-zinc-500">Загрузка dashboard...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="DAU" value={data.kpis.dau} />
        <KpiCard label="WAU" value={data.kpis.wau} />
        <KpiCard label="MAU" value={data.kpis.mau} />
        <KpiCard label="Новые за 7 дней" value={data.kpis.newProfiles7d} />
        <KpiCard label="Свайпы за 24ч" value={data.kpis.swipes24h} />
        <KpiCard label="Матчи за 24ч" value={data.kpis.matches24h} />
        <KpiCard label="Redeem за 24ч" value={data.kpis.redeems24h} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold">DAU за период</h2>
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">День</th>
                  <th className="px-3 py-2 text-right">DAU</th>
                </tr>
              </thead>
              <tbody>
                {data.dauSeries.map((point) => (
                  <tr key={point.day} className="border-t border-zinc-800">
                    <td className="px-3 py-2">{point.day}</td>
                    <td className="px-3 py-2 text-right">{point.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Топ подозрительных</h2>
            <Link href="/admin/match/spam" className="text-xs text-violet-300">
              все →
            </Link>
          </div>
          <div className="space-y-2">
            {data.topSuspicious.map((item) => (
              <Link
                key={item.profileId}
                href={`/admin/match/users/${item.profileId}`}
                className="block rounded-lg border border-zinc-800 px-3 py-2 text-sm hover:border-zinc-700"
              >
                <p className="font-medium">{item.displayName}</p>
                <p className="text-xs text-zinc-500">
                  {item.role} • score {item.suspicionScore}
                </p>
              </Link>
            ))}
            {data.topSuspicious.length === 0 ? (
              <p className="text-sm text-zinc-500">Нет профилей с высоким score.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold">Распределение по маркетплейсам</h2>
          <div className="mt-3 space-y-2">
            {data.marketplaceDistribution.map((item) => (
              <div key={item.marketplace} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{item.marketplace}</span>
                <span className="text-zinc-100">{item.count}</span>
              </div>
            ))}
            {data.marketplaceDistribution.length === 0 ? (
              <p className="text-sm text-zinc-500">Данных пока нет.</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold">Распределение по формату работы</h2>
          <div className="mt-3 space-y-2">
            {data.workFormatDistribution.map((item) => (
              <div key={item.workFormat} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{item.workFormat}</span>
                <span className="text-zinc-100">{item.count}</span>
              </div>
            ))}
            {data.workFormatDistribution.length === 0 ? (
              <p className="text-sm text-zinc-500">Данных пока нет.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
