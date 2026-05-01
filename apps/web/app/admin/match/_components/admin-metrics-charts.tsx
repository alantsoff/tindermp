'use client';

import { useSyncExternalStore } from 'react';
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

type ChartTheme = {
  grid: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  registrations: string;
  swipes: string;
  matches: string;
};

const LIGHT_THEME: ChartTheme = {
  grid: 'rgba(60, 60, 67, 0.18)',
  tick: 'rgba(60, 60, 67, 0.65)',
  tooltipBg: 'rgba(255, 255, 255, 0.96)',
  tooltipBorder: 'rgba(60, 60, 67, 0.18)',
  tooltipText: 'rgb(0, 0, 0)',
  registrations: 'rgb(175, 82, 222)',
  swipes: 'rgb(50, 173, 230)',
  matches: 'rgb(52, 199, 89)',
};

const DARK_THEME: ChartTheme = {
  grid: 'rgba(235, 235, 245, 0.18)',
  tick: 'rgba(235, 235, 245, 0.7)',
  tooltipBg: 'rgba(28, 28, 30, 0.96)',
  tooltipBorder: 'rgba(235, 235, 245, 0.2)',
  tooltipText: 'rgb(255, 255, 255)',
  registrations: 'rgb(191, 90, 242)',
  swipes: 'rgb(100, 210, 255)',
  matches: 'rgb(48, 209, 88)',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeDark(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getDarkSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function getDarkServerSnapshot(): boolean {
  return false;
}

function useChartTheme(): ChartTheme {
  const isDark = useSyncExternalStore(subscribeDark, getDarkSnapshot, getDarkServerSnapshot);
  return isDark ? DARK_THEME : LIGHT_THEME;
}

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
  theme,
}: {
  title: string;
  data: Point[];
  dataKey: keyof Point;
  color: string;
  granularity: 'day' | 'hour';
  showX: boolean;
  theme: ChartTheme;
}) {
  return (
    <div className="min-w-0 w-full">
      <p className="mb-1 text-xs font-medium text-ios-label-secondary">{title}</p>
      <div className="h-[160px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: showX ? 4 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="t"
            hide={!showX}
            tick={{ fontSize: 9, fill: theme.tick }}
            tickFormatter={(v) => formatTick(String(v), granularity)}
            minTickGap={granularity === 'hour' ? 32 : 8}
          />
          <YAxis width={44} tick={{ fontSize: 10, fill: theme.tick }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: theme.tooltipText,
            }}
            labelStyle={{ color: theme.tooltipText }}
            itemStyle={{ color: theme.tooltipText }}
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
    </div>
  );
}

export function AdminMetricsCharts({
  granularity,
  periodLabel,
  data,
  isLoading,
  isError,
  errorMessage,
}: {
  granularity: 'day' | 'hour';
  periodLabel: string;
  data: Point[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
}) {
  const theme = useChartTheme();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4 text-sm text-ios-label-tertiary">
        Загрузка графиков…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-[rgb(var(--ios-orange)/0.4)] bg-[rgb(var(--ios-orange)/0.1)] p-4 text-sm text-ios-label">
        <p className="font-medium text-ios-orange">Графики не загрузились</p>
        <p className="mt-1 break-words text-ios-label-secondary">
          {errorMessage?.trim() || 'Ошибка запроса. Часто это старая версия API: перезапустите match-api после deploy или проверьте, что /match-admin/metrics-series доступен.'}
        </p>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4 text-sm text-ios-label-tertiary">
        Нет данных за выбранный период.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Регистрации, свайпы, матчи</h2>
        <p className="text-xs text-ios-label-tertiary">{periodLabel}</p>
      </div>
      <div className="space-y-5">
        <ChartBlock
          title="Регистрации"
          data={data}
          dataKey="registrations"
          color={theme.registrations}
          granularity={granularity}
          showX={false}
          theme={theme}
        />
        <ChartBlock
          title="Свайпы"
          data={data}
          dataKey="swipes"
          color={theme.swipes}
          granularity={granularity}
          showX={false}
          theme={theme}
        />
        <ChartBlock
          title="Матчи"
          data={data}
          dataKey="matches"
          color={theme.matches}
          granularity={granularity}
          showX
          theme={theme}
        />
      </div>
      <p className="mt-3 text-xs text-ios-label-tertiary">
        По дням — из суточных агрегатов; по часам — подсчёт событий за выбранное число суток (до 14).
      </p>
    </div>
  );
}
