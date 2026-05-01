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
    <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-ios-label-tertiary">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString('ru-RU')}</p>
    </div>
  );
}

const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  match: 'Новый матч',
  message: 'Сообщение в чате',
  incoming_like: 'Вас лайкнули',
  invite_redeemed: 'Активация инвайта',
  digest: 'Дайджест',
  pending_likes: 'Pending likes ping',
  auto_reset: 'Авто-сброс ленты',
};

const NOTIFICATION_REASON_LABELS: Record<string, string> = {
  master_muted: 'Master mute (notificationsMuted)',
  kind_disabled: 'Per-type opt-out',
  rate_limited: 'Throttle window',
};

function NotificationsCard({
  data,
}: {
  data: {
    sent: number;
    throttled: number;
    sentByKind: Record<string, number>;
    throttledByReason: Record<string, number>;
  };
}) {
  const sentEntries = Object.entries(data.sentByKind).sort(
    (a, b) => b[1] - a[1],
  );
  const throttledEntries = Object.entries(data.throttledByReason).sort(
    (a, b) => b[1] - a[1],
  );
  const total = data.sent + data.throttled;
  const deliveryRate = total > 0 ? Math.round((data.sent / total) * 100) : null;
  return (
    <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Уведомления за 24 часа</h2>
        <p className="text-xs text-ios-label-tertiary">
          Sent / Throttled — диагностика NotificationService.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[rgb(var(--hairline))] bg-ios-inset p-3">
          <p className="text-xs uppercase tracking-wide text-ios-label-tertiary">Отправлено</p>
          <p className="mt-1 text-2xl font-semibold text-ios-green">
            {data.sent.toLocaleString('ru-RU')}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--hairline))] bg-ios-inset p-3">
          <p className="text-xs uppercase tracking-wide text-ios-label-tertiary">Подавлено</p>
          <p className="mt-1 text-2xl font-semibold text-ios-orange">
            {data.throttled.toLocaleString('ru-RU')}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--hairline))] bg-ios-inset p-3">
          <p className="text-xs uppercase tracking-wide text-ios-label-tertiary">Доставка</p>
          <p className="mt-1 text-2xl font-semibold">
            {deliveryRate == null ? '—' : `${deliveryRate}%`}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-ios-label-tertiary">
            Sent — по типу
          </p>
          {sentEntries.length === 0 ? (
            <p className="text-sm text-ios-label-tertiary">Ничего не уходило за 24 часа.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sentEntries.map(([kind, count]) => (
                <li key={kind} className="flex justify-between border-b border-[rgb(var(--hairline))] py-1">
                  <span className="text-ios-label-secondary">
                    {NOTIFICATION_KIND_LABELS[kind] ?? kind}
                  </span>
                  <span className="font-medium text-ios-label">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-ios-label-tertiary">
            Throttled — по причине
          </p>
          {throttledEntries.length === 0 ? (
            <p className="text-sm text-ios-label-tertiary">Ни одного отказа.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {throttledEntries.map(([reason, count]) => (
                <li key={reason} className="flex justify-between border-b border-[rgb(var(--hairline))] py-1">
                  <span className="text-ios-label-secondary">
                    {NOTIFICATION_REASON_LABELS[reason] ?? reason}
                  </span>
                  <span className="font-medium text-ios-label">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
    return <div className="text-sm text-ios-label-tertiary">Загрузка dashboard...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated px-4 py-3 text-sm">
        <span className="text-ios-label-tertiary">Графики:</span>
        <div className="flex rounded-lg border border-[rgb(var(--hairline-strong))] p-0.5">
          <button
            type="button"
            onClick={() => setGranularity('day')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              granularity === 'day'
                ? 'bg-ios-purple text-white'
                : 'text-ios-label-secondary hover:text-ios-label'
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
            className={`rounded-md px-3 py-1.5 transition-colors ${
              granularity === 'hour'
                ? 'bg-ios-purple text-white'
                : 'text-ios-label-secondary hover:text-ios-label'
            }`}
          >
            По часам
          </button>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-ios-label-tertiary">Период</span>
          <select
            className="rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-2 py-1.5 text-ios-label focus:border-ios-purple focus:outline-none"
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
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h2 className="font-semibold">DAU за период</h2>
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-[rgb(var(--hairline))]">
            <table className="w-full text-sm">
              <thead className="bg-ios-inset text-ios-label-secondary">
                <tr>
                  <th className="px-3 py-2 text-left">День</th>
                  <th className="px-3 py-2 text-right">DAU</th>
                </tr>
              </thead>
              <tbody>
                {data.dauSeries.map((point) => (
                  <tr key={point.day} className="border-t border-[rgb(var(--hairline))]">
                    <td className="px-3 py-2">{point.day}</td>
                    <td className="px-3 py-2 text-right">{point.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Топ подозрительных</h2>
            <Link href="/admin/match/spam" className="text-xs text-ios-purple hover:opacity-80">
              все →
            </Link>
          </div>
          <div className="space-y-2">
            {data.topSuspicious.map((item) => (
              <Link
                key={item.profileId}
                href={`/admin/match/users/${item.profileId}`}
                className="block rounded-lg border border-[rgb(var(--hairline))] px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ios-fill-1)/0.12)]"
              >
                <p className="font-medium">{item.displayName}</p>
                <p className="text-xs text-ios-label-tertiary">
                  {item.role} • score {item.suspicionScore}
                </p>
              </Link>
            ))}
            {data.topSuspicious.length === 0 ? (
              <p className="text-sm text-ios-label-tertiary">Нет профилей с высоким score.</p>
            ) : null}
          </div>
        </div>
      </div>

      <NotificationsCard data={data.notifications24h} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h2 className="font-semibold">Распределение по маркетплейсам</h2>
          <div className="mt-3 space-y-2">
            {data.marketplaceDistribution.map((item) => (
              <div key={item.marketplace} className="flex items-center justify-between text-sm">
                <span className="text-ios-label-secondary">{item.marketplace}</span>
                <span className="text-ios-label">{item.count}</span>
              </div>
            ))}
            {data.marketplaceDistribution.length === 0 ? (
              <p className="text-sm text-ios-label-tertiary">Данных пока нет.</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h2 className="font-semibold">Распределение по формату работы</h2>
          <div className="mt-3 space-y-2">
            {data.workFormatDistribution.map((item) => (
              <div key={item.workFormat} className="flex items-center justify-between text-sm">
                <span className="text-ios-label-secondary">{item.workFormat}</span>
                <span className="text-ios-label">{item.count}</span>
              </div>
            ))}
            {data.workFormatDistribution.length === 0 ? (
              <p className="text-sm text-ios-label-tertiary">Данных пока нет.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
