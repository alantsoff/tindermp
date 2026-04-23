'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AdminMetricsCharts } from './_components/admin-metrics-charts';
import { useAdminMetricsSeries, useAdminOverview } from './_lib/queries';

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

const PERIODS_DAY = [7, 30, 60, 90, 180] as const;
const PERIODS_HOUR = [1, 3, 7, 14] as const;

export default function MatchAdminDashboardPage() {
  const { data, isLoading } = useAdminOverview();
  const [granularity, setGranularity] = useState<'day' | 'hour'>('day');
  const [periodDay, setPeriodDay] = useState(30);
  const [periodHour, setPeriodHour] = useState(7);

  const period = granularity === 'day' ? periodDay : periodHour;
  const metricsQuery = useAdminMetricsSeries({ granularity, period });

  const periodLabel = useMemo(() => {
    if (granularity === 'day') {
      return `По дням, последние ${period} дн.`;
    }
    return `По часам, последние ${period} сут.`;
  }, [granularity, period]);

  if (isLoading) {
    return <div className="text-sm text-zinc-500">Загрузка dashboard...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
        <span className="text-zinc-500">Графики:</span>
        <div className="flex rounded-lg border border-zinc-700 p-0.5">
          <button
            type="button"
            onClick={() => setGranularity('day')}
            className={`rounded-md px-3 py-1.5 ${
              granularity === 'day' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            По дням
          </button>
          <button
            type="button"
            onClick={() => {
              setGranularity('hour');
              setPeriodHour((h) => (PERIODS_HOUR.includes(h as (typeof PERIODS_HOUR)[number]) ? h : 7));
            }}
            className={`rounded-md px-3 py-1.5 ${
              granularity === 'hour' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            По часам
          </button>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Период</span>
          <select
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200"
            value={String(period)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (granularity === 'day') setPeriodDay(v);
              else setPeriodHour(v);
            }}
          >
            {(granularity === 'day' ? PERIODS_DAY : PERIODS_HOUR).map((d) => (
              <option key={d} value={d}>
                {granularity === 'day' ? `${d} дн.` : `${d} сут.`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AdminMetricsCharts
        granularity={granularity}
        periodLabel={periodLabel}
        data={metricsQuery.data?.points}
        isLoading={metricsQuery.isLoading}
        isError={metricsQuery.isError}
        errorMessage={
          metricsQuery.error instanceof Error
            ? metricsQuery.error.message
            : metricsQuery.error != null
              ? String(metricsQuery.error)
              : undefined
        }
      />

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
