'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clearAdminToken, getAdminToken } from './_lib/api';
import { useAdminAuthMe } from './_lib/queries';

const NAV = [
  { href: '/admin/match', label: 'Dashboard' },
  { href: '/admin/match/users', label: 'Пользователи' },
  { href: '/admin/match/invite-tree', label: 'Дерево' },
  { href: '/admin/match/spam', label: 'Спам' },
  { href: '/admin/match/invites', label: 'Инвайты' },
  { href: '/admin/match/audit', label: 'Аудит' },
  { href: '/admin/match/live', label: 'Live' },
];

export default function MatchAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const token = getAdminToken();
  const { data, isLoading } = useAdminAuthMe();

  useEffect(() => {
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    if (!isLoading && !data?.ok) {
      clearAdminToken();
      router.replace('/admin/login');
    }
  }, [data?.ok, isLoading, router, token]);

  if (!token || isLoading || !data?.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-500">
        Проверяем доступ...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Match Admin</h1>
        <p className="text-sm text-zinc-400">
          Модерация, инвайты, антиспам и операционная статистика.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? 'border-violet-400 bg-violet-500/20 text-white'
                  : 'border-zinc-700 text-zinc-300'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
          onClick={() => {
            clearAdminToken();
            router.replace('/admin/login');
          }}
        >
          Выйти
        </button>
      </div>
      {children}
    </div>
  );
}
