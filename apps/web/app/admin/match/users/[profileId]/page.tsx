'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { matchAdminApi } from '../../_lib/api';
import { useAdminUser } from '../../_lib/queries';
import { MARKETPLACE_LABELS, WORK_FORMAT_LABELS } from '../../../../m/_lib/labels';

export default function MatchAdminUserDetailsPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = params.profileId;
  const { data, isLoading, refetch } = useAdminUser(profileId);
  const [reason, setReason] = useState('');
  const [running, setRunning] = useState(false);

  if (isLoading) return <div className="text-sm text-zinc-500">Загрузка карточки...</div>;
  if (!data) return <div className="text-sm text-zinc-500">Профиль не найден</div>;

  const payload = data as {
    profile: {
      id: string;
      displayName: string;
      role: string;
      workFormats?: string[];
      marketplaces?: string[];
      marketplacesCustom?: string | null;
      user?: { telegramId?: string | null; telegramUsername?: string | null } | null;
      spamSignal?: unknown;
      invitesIssued?: unknown;
    };
    events?: unknown;
  };
  const profile = payload.profile;

  const run = async (fn: () => Promise<unknown>) => {
    setRunning(true);
    try {
      await fn();
      setReason('');
      await refetch();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{profile.displayName}</h2>
            <p className="text-sm text-zinc-400">
              {profile.id} • {profile.role}
            </p>
            <p className="text-sm text-zinc-500">
              tg: {profile.user?.telegramId} {profile.user?.telegramUsername ? `(@${profile.user.telegramUsername})` : ''}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Формат: {(profile.workFormats ?? [])
                .map((value) => WORK_FORMAT_LABELS[value as keyof typeof WORK_FORMAT_LABELS] ?? value)
                .join(', ') || '—'}
            </p>
            <p className="text-xs text-zinc-400">
              Маркетплейсы: {(profile.marketplaces ?? [])
                .map((value) => MARKETPLACE_LABELS[value as keyof typeof MARKETPLACE_LABELS] ?? value)
                .join(', ') || '—'}
              {profile.marketplacesCustom ? ` (${profile.marketplacesCustom})` : ''}
            </p>
          </div>
          <div className="space-x-2">
            <button
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.issueToProfile(profileId, 5, reason))}
            >
              Подарить 5 кодов
            </button>
            <button
              className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm text-amber-300"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.ban(profileId, { reason, shadow: true }))}
            >
              Shadow-ban
            </button>
            <button
              className="rounded-lg border border-red-500/50 px-3 py-1.5 text-sm text-red-300"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.ban(profileId, { reason }))}
            >
              Забанить
            </button>
            <button
              className="rounded-lg border border-emerald-500/50 px-3 py-1.5 text-sm text-emerald-300"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.unban(profileId, reason))}
            >
              Разбанить
            </button>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Причина модерационного действия (обязательно)"
          className="mt-3 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-semibold">Спам-сигналы</h3>
          <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
            {JSON.stringify(profile.spamSignal ?? null, null, 2)}
          </pre>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-semibold">Приглашения</h3>
          <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
            {JSON.stringify(profile.invitesIssued ?? [], null, 2)}
          </pre>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="font-semibold">События</h3>
        <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
          {JSON.stringify(payload.events ?? [], null, 2)}
        </pre>
      </div>
    </div>
  );
}
