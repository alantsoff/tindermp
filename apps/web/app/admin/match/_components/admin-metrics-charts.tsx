'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Point = {
  t: string;
  registrations: number;
  swipes: number;
  matches: number;
};

function formatTick(value: string, granularity: 'day' | 'hour'): string {
  if (granularity === 'day') {
    const [, m, d] = value.split('-');
    return `${d}.${m}`;
  }
  const date = new Date(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChartBlock({
  title,
  data,
  dataKey,
  color,
  granularity,
  showX,
}: {
  title: string;
  data: Point[];
  dataKey: keyof Point;
  color: string;
  granularity: 'day' | 'hour';
  showX: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-400">{title}</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: showX ? 4 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis
            dataKey="t"
            hide={!showX}
            tick={{ fontSize: 9, fill: '#a1a1aa' }}
            tickFormatter={(v) => formatTick(String(v), granularity)}
            minTickGap={granularity === 'hour' ? 32 : 8}
          />
          <YAxis width={44} tick={{ fontSize: 10, fill: '#a1a1aa' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) =>
              granularity === 'day'
                ? String(v)
                : new Date(String(v)).toLocaleString('ru-RU')
            }
            formatter={(val) => [
              Number(val ?? 0).toLocaleString('ru-RU'),
              title,
            ]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name={title}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdminMetricsCharts({
  granularity,
  periodLabel,
  data,
  isLoading,
}: {
  granularity: 'day' | 'hour';
  periodLabel: string;
  data: Point[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
        Загрузка графиков…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
        Нет данных за выбранный период.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Регистрации, свайпы, матчи</h2>
        <p className="text-xs text-zinc-500">{periodLabel}</p>
      </div>
      <div className="space-y-5">
        <ChartBlock
          title="Регистрации"
          data={data}
          dataKey="registrations"
          color="#a78bfa"
          granularity={granularity}
          showX={false}
        />
        <ChartBlock
          title="Свайпы"
          data={data}
          dataKey="swipes"
          color="#22d3ee"
          granularity={granularity}
          showX={false}
        />
        <ChartBlock
          title="Матчи"
          data={data}
          dataKey="matches"
          color="#4ade80"
          granularity={granularity}
          showX
        />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        По дням — из суточных агрегатов; по часам — подсчёт событий за выбранное число суток (до 14).
      </p>
    </div>
  );
}
