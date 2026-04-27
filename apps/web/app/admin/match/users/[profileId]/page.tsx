'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { matchAdminApi } from '../../_lib/api';
import { useAdminUser } from '../../_lib/queries';
import { MARKETPLACE_LABELS, WORK_FORMAT_LABELS } from '../../../../m/_lib/labels';

function profileIdFromParams(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  const s = Array.isArray(raw) ? raw[0] : raw;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default function MatchAdminUserDetailsPage() {
  const params = useParams<{ profileId: string }>();
  const profileId = useMemo(() => profileIdFromParams(params?.profileId), [params?.profileId]);
  const { data, isLoading, isError, error, refetch } = useAdminUser(profileId);
  const [reason, setReason] = useState('');
  const [running, setRunning] = useState(false);

  if (!profileId) {
    return <div className="text-sm text-zinc-500">Некорректная ссылка (нет profileId в URL).</div>;
  }
  if (isLoading) return <div className="text-sm text-zinc-500">Загрузка карточки...</div>;
  if (isError) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-red-300">Не удалось загрузить профиль: {error instanceof Error ? error.message : 'ошибка'}</p>
        <p className="text-zinc-500">
          Проверь, что в <code className="text-zinc-400">next.config</code> есть rewrite{' '}
          <code className="text-zinc-400">/match-admin</code> → API и задан{' '}
          <code className="text-zinc-400">NEXT_INTERNAL_API_URL</code> на сервере веба.
        </p>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-xs"
          onClick={() => void refetch()}
        >
          Повторить
        </button>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-zinc-500">Профиль не найден (пустой ответ API).</div>;

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
      notificationsMuted?: boolean;
      settings?: {
        notifyMatch: boolean;
        notifyIncomingLike: boolean;
        notifyMessage: boolean;
        notifyInvite: boolean;
        notifyDigest: boolean;
      } | null;
      /** Код, которым зарегистрировались; owner — кто этот код выпустил (пригласивший) */
      invitedBy?: {
        id: string;
        code: string;
        source: string;
        createdAt: string;
        usedAt: string | null;
        owner: { id: string; displayName: string; role: string } | null;
      } | null;
    };
    events?: unknown;
  };
  const profile = payload.profile;
  const inviter = profile.invitedBy?.owner;
  const usedInvite = profile.invitedBy;
  const notifSettings = profile.settings;
  const masterMuted = profile.notificationsMuted ?? false;

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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="font-semibold">Кто пригласил (по инвайту)</h3>
        {usedInvite ? (
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500">Код: </span>
              <span className="font-mono">{usedInvite.code}</span>
            </p>
            <p>
              <span className="text-zinc-500">Источник выдачи: </span>
              {usedInvite.source}
            </p>
            {usedInvite.usedAt ? (
              <p>
                <span className="text-zinc-500">Активирован: </span>
                {new Date(usedInvite.usedAt).toLocaleString('ru-RU')}
              </p>
            ) : null}
            {inviter ? (
              <p>
                <span className="text-zinc-500">Пригласил: </span>
                <Link
                  href={`/admin/match/users/${encodeURIComponent(inviter.id)}`}
                  className="font-medium text-violet-300 hover:text-violet-200"
                >
                  {inviter.displayName}
                </Link>
                <span className="text-zinc-500"> ({inviter.role})</span>
                <span className="ml-2 font-mono text-xs text-zinc-500">{inviter.id}</span>
              </p>
            ) : (
              <p className="text-amber-200/90">
                Владелец кода не привязан к профилю (detached / системный сценарий) — в дереве
                приглашений смотрите по коду.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">
            Нет записи об использовании инвайт-кода: регистрация до внедрения цепочки, обход
            админа, или данные ещё не сопоставлены.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">Уведомления (Telegram bot push)</h3>
          {masterMuted ? (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
              Master mute
            </span>
          ) : null}
        </div>
        {notifSettings ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['notifyMatch', 'Новый матч'],
                ['notifyMessage', 'Сообщения'],
                ['notifyIncomingLike', 'Вас лайкнули'],
                ['notifyInvite', 'Активация инвайта'],
                ['notifyDigest', 'Дайджест'],
              ] as const
            ).map(([key, label]) => {
              const enabled = notifSettings[key];
              const effectivelyOn = !masterMuted && enabled;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-300">{label}</span>
                  <span
                    className={
                      effectivelyOn
                        ? 'text-emerald-300'
                        : enabled
                          ? 'text-amber-300'
                          : 'text-zinc-500'
                    }
                  >
                    {effectivelyOn
                      ? 'on'
                      : enabled
                        ? 'on (master off)'
                        : 'off'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            У профиля нет MatchSettings — все per-type флаги считаются включёнными
            (default true).
          </p>
        )}
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
