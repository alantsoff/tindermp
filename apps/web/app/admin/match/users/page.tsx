'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAdminUsers } from '../_lib/queries';
import { MARKETPLACE_LABELS, WORK_FORMAT_LABELS } from '../../../m/_lib/labels';
import { MATCH_ROLES } from '../../../m/_components/RolePicker';

const INPUT_CLASS =
  'rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none';

export default function MatchAdminUsersPage() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [workFormat, setWorkFormat] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [banned, setBanned] = useState('');

  const params = useMemo(
    () => ({
      query,
      role: role || undefined,
      workFormat: workFormat || undefined,
      marketplace: marketplace || undefined,
      banned: banned || undefined,
      limit: 100,
    }),
    [banned, marketplace, query, role, workFormat],
  );
  const { data, isLoading } = useAdminUsers(params);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск: имя, telegramId, username"
            className={INPUT_CLASS}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Роль: все</option>
            {MATCH_ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={workFormat}
            onChange={(event) => setWorkFormat(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Формат: все</option>
            {(Object.keys(WORK_FORMAT_LABELS) as Array<keyof typeof WORK_FORMAT_LABELS>).map((value) => (
              <option key={value} value={value}>
                {WORK_FORMAT_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            value={marketplace}
            onChange={(event) => setMarketplace(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Маркетплейс: все</option>
            {(Object.keys(MARKETPLACE_LABELS) as Array<keyof typeof MARKETPLACE_LABELS>).map((value) => (
              <option key={value} value={value}>
                {MARKETPLACE_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            value={banned}
            onChange={(event) => setBanned(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Все статусы</option>
            <option value="1">Только забаненные</option>
            <option value="0">Только не забаненные</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-ios-inset text-ios-label-secondary">
            <tr>
              <th className="px-3 py-2 text-left">Пользователь</th>
              <th className="px-3 py-2 text-left">Роль</th>
              <th className="px-3 py-2 text-left">Активность</th>
              <th className="px-3 py-2 text-left">Формат / MP</th>
              <th className="px-3 py-2 text-right">Свайпы</th>
              <th className="px-3 py-2 text-right">Матчи</th>
              <th className="px-3 py-2 text-right">Инвайты</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-left">Статус</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-3 text-ios-label-tertiary" colSpan={10}>
                  Загрузка...
                </td>
              </tr>
            ) : (
              (data?.items ?? []).map((item) => {
                const row = item as {
                  profileId: string;
                  displayName: string;
                  telegramId?: string | null;
                  telegramUsername?: string | null;
                  role: string;
                  createdAt: string;
                  lastActiveAt: string;
                  swipes?: { total?: number; likes?: number; passes?: number };
                  workFormats?: string[];
                  marketplaces?: string[];
                  matches?: { total?: number };
                  invites?: { available?: number; issued?: number };
                  suspicionScore?: number;
                  bannedAt?: string | null;
                  shadowBanned?: boolean;
                };
                return (
                  <tr key={row.profileId} className="border-t border-[rgb(var(--hairline))]">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.displayName}</p>
                      <p className="text-xs text-ios-label-tertiary">
                        {row.telegramId} {row.telegramUsername ? `(@${row.telegramUsername})` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2">{row.role}</td>
                    <td className="px-3 py-2 text-xs text-ios-label-secondary">
                      <p>создан: {new Date(row.createdAt).toLocaleString('ru-RU')}</p>
                      <p>был онлайн: {new Date(row.lastActiveAt).toLocaleString('ru-RU')}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-ios-label-secondary">
                      <p>{row.workFormats?.join(', ') || '—'}</p>
                      <p>{row.marketplaces?.join(', ') || '—'}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.swipes?.total ?? 0} ({row.swipes?.likes ?? 0}/{row.swipes?.passes ?? 0})
                    </td>
                    <td className="px-3 py-2 text-right">{row.matches?.total ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      {row.invites?.available ?? 0}/{row.invites?.issued ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right">{row.suspicionScore ?? 0}</td>
                    <td className="px-3 py-2">
                      {row.bannedAt ? (
                        <span className="rounded bg-[rgb(var(--ios-red)/0.18)] px-2 py-0.5 text-xs text-ios-red">banned</span>
                      ) : row.shadowBanned ? (
                        <span className="rounded bg-[rgb(var(--ios-orange)/0.18)] px-2 py-0.5 text-xs text-ios-orange">shadow</span>
                      ) : (
                        <span className="rounded bg-[rgb(var(--ios-green)/0.18)] px-2 py-0.5 text-xs text-ios-green">ok</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/match/users/${row.profileId}`}
                        className="text-xs text-ios-purple hover:opacity-80"
                      >
                        детали
                      </Link>
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
