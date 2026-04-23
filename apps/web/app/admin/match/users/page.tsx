'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAdminUsers } from '../_lib/queries';
import { MARKETPLACE_LABELS, WORK_FORMAT_LABELS } from '../../../m/_lib/labels';
import { MATCH_ROLES } from '../../../m/_components/RolePicker';

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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск: имя, telegramId, username"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">Все статусы</option>
            <option value="1">Только забаненные</option>
            <option value="0">Только не забаненные</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
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
                <td className="px-3 py-3 text-zinc-500" colSpan={10}>
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
                  <tr key={row.profileId} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.displayName}</p>
                      <p className="text-xs text-zinc-500">
                        {row.telegramId} {row.telegramUsername ? `(@${row.telegramUsername})` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2">{row.role}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      <p>создан: {new Date(row.createdAt).toLocaleString('ru-RU')}</p>
                      <p>был онлайн: {new Date(row.lastActiveAt).toLocaleString('ru-RU')}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
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
                        <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">banned</span>
                      ) : row.shadowBanned ? (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">shadow</span>
                      ) : (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">ok</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/match/users/${row.profileId}`}
                        className="text-xs text-violet-300"
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
