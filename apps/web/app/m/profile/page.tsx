'use client';

import Link from 'next/link';
import { useMatchMe } from '../_lib/queries';

export default function MatchProfilePage() {
  const { data, isLoading } = useMatchMe();

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-zinc-400">Загружаем профиль…</div>;
  }

  if (!data?.profile) {
    return (
      <div className="py-20 text-center">
        <p className="mb-3 text-sm text-zinc-400">Профиль ещё не создан.</p>
        <Link className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold" href="/m/onboarding">
          Пройти онбординг
        </Link>
      </div>
    );
  }

  const profile = data.profile;
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">{profile.displayName}</h1>
      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <p className="text-zinc-300">Роль: {profile.role === 'CUSTOM' ? profile.roleCustom ?? 'Custom' : profile.role}</p>
        {profile.headline ? <p className="text-zinc-300">Зачем я тут: {profile.headline}</p> : null}
        <p className="text-zinc-400">Ниши: {profile.niches.join(', ') || '—'}</p>
        <p className="text-zinc-400">Навыки: {profile.skills.join(', ') || '—'}</p>
        <p className="text-zinc-400">Контакт: {profile.telegramContact || '—'}</p>
      </div>
      <div className="mt-3 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <h2 className="font-semibold text-zinc-200">Кого ищу</h2>
        <p className="text-zinc-400">Роли: {data.settings?.interestedRoles.join(', ') || 'все'}</p>
        <p className="text-zinc-400">Ниши: {data.settings?.interestedNiches.join(', ') || 'все'}</p>
      </div>
      <Link href="/m/onboarding" className="mt-4 inline-block text-sm text-violet-300">
        Редактировать профиль
      </Link>
    </div>
  );
}
