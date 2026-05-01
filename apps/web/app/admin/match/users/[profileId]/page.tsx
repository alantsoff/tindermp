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
    return <div className="text-sm text-ios-label-tertiary">Некорректная ссылка (нет profileId в URL).</div>;
  }
  if (isLoading) return <div className="text-sm text-ios-label-tertiary">Загрузка карточки...</div>;
  if (isError) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-ios-red">Не удалось загрузить профиль: {error instanceof Error ? error.message : 'ошибка'}</p>
        <p className="text-ios-label-tertiary">
          Проверь, что в <code className="text-ios-label-secondary">next.config</code> есть rewrite{' '}
          <code className="text-ios-label-secondary">/match-admin</code> → API и задан{' '}
          <code className="text-ios-label-secondary">NEXT_INTERNAL_API_URL</code> на сервере веба.
        </p>
        <button
          type="button"
          className="rounded border border-[rgb(var(--hairline-strong))] px-2 py-1 text-xs text-ios-label-secondary hover:bg-[rgb(var(--ios-fill-1)/0.12)]"
          onClick={() => void refetch()}
        >
          Повторить
        </button>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-ios-label-tertiary">Профиль не найден (пустой ответ API).</div>;

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
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{profile.displayName}</h2>
            <p className="text-sm text-ios-label-secondary">
              {profile.id} • {profile.role}
            </p>
            <p className="text-sm text-ios-label-tertiary">
              tg: {profile.user?.telegramId} {profile.user?.telegramUsername ? `(@${profile.user.telegramUsername})` : ''}
            </p>
            <p className="mt-2 text-xs text-ios-label-secondary">
              Формат: {(profile.workFormats ?? [])
                .map((value) => WORK_FORMAT_LABELS[value as keyof typeof WORK_FORMAT_LABELS] ?? value)
                .join(', ') || '—'}
            </p>
            <p className="text-xs text-ios-label-secondary">
              Маркетплейсы: {(profile.marketplaces ?? [])
                .map((value) => MARKETPLACE_LABELS[value as keyof typeof MARKETPLACE_LABELS] ?? value)
                .join(', ') || '—'}
              {profile.marketplacesCustom ? ` (${profile.marketplacesCustom})` : ''}
            </p>
          </div>
          <div className="space-x-2">
            <button
              className="rounded-lg border border-[rgb(var(--hairline-strong))] px-3 py-1.5 text-sm text-ios-label-secondary hover:bg-[rgb(var(--ios-fill-1)/0.12)] disabled:opacity-50"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.issueToProfile(profileId, 5, reason))}
            >
              Подарить 5 кодов
            </button>
            <button
              className="rounded-lg border border-[rgb(var(--ios-orange)/0.5)] px-3 py-1.5 text-sm text-ios-orange hover:bg-[rgb(var(--ios-orange)/0.12)] disabled:opacity-50"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.ban(profileId, { reason, shadow: true }))}
            >
              Shadow-ban
            </button>
            <button
              className="rounded-lg border border-[rgb(var(--ios-red)/0.5)] px-3 py-1.5 text-sm text-ios-red hover:bg-[rgb(var(--ios-red)/0.12)] disabled:opacity-50"
              disabled={!reason || running}
              onClick={() => run(() => matchAdminApi.ban(profileId, { reason }))}
            >
              Забанить
            </button>
            <button
              className="rounded-lg border border-[rgb(var(--ios-green)/0.5)] px-3 py-1.5 text-sm text-ios-green hover:bg-[rgb(var(--ios-green)/0.12)] disabled:opacity-50"
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
          className="mt-3 min-h-20 w-full rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <h3 className="font-semibold">Кто пригласил (по инвайту)</h3>
        {usedInvite ? (
          <div className="mt-3 space-y-2 text-sm text-ios-label-secondary">
            <p>
              <span className="text-ios-label-tertiary">Код: </span>
              <span className="font-mono text-ios-label">{usedInvite.code}</span>
            </p>
            <p>
              <span className="text-ios-label-tertiary">Источник выдачи: </span>
              {usedInvite.source}
            </p>
            {usedInvite.usedAt ? (
              <p>
                <span className="text-ios-label-tertiary">Активирован: </span>
                {new Date(usedInvite.usedAt).toLocaleString('ru-RU')}
              </p>
            ) : null}
            {inviter ? (
              <p>
                <span className="text-ios-label-tertiary">Пригласил: </span>
                <Link
                  href={`/admin/match/users/${encodeURIComponent(inviter.id)}`}
                  className="font-medium text-ios-purple hover:opacity-80"
                >
                  {inviter.displayName}
                </Link>
                <span className="text-ios-label-tertiary"> ({inviter.role})</span>
                <span className="ml-2 font-mono text-xs text-ios-label-tertiary">{inviter.id}</span>
              </p>
            ) : (
              <p className="text-ios-orange">
                Владелец кода не привязан к профилю (detached / системный сценарий) — в дереве
                приглашений смотрите по коду.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ios-label-secondary">
            Нет записи об использовании инвайт-кода: регистрация до внедрения цепочки, обход
            админа, или данные ещё не сопоставлены.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">Уведомления (Telegram bot push)</h3>
          {masterMuted ? (
            <span className="rounded-full border border-[rgb(var(--ios-red)/0.4)] bg-[rgb(var(--ios-red)/0.1)] px-2 py-0.5 text-xs text-ios-red">
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
                  className="flex items-center justify-between rounded-lg border border-[rgb(var(--hairline))] bg-ios-inset px-3 py-2 text-sm"
                >
                  <span className="text-ios-label-secondary">{label}</span>
                  <span
                    className={
                      effectivelyOn
                        ? 'text-ios-green'
                        : enabled
                          ? 'text-ios-orange'
                          : 'text-ios-label-tertiary'
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
          <p className="mt-3 text-sm text-ios-label-tertiary">
            У профиля нет MatchSettings — все per-type флаги считаются включёнными
            (default true).
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h3 className="font-semibold">Спам-сигналы</h3>
          <pre className="mt-2 overflow-auto rounded bg-ios-inset p-3 text-xs text-ios-label-secondary">
            {JSON.stringify(profile.spamSignal ?? null, null, 2)}
          </pre>
        </div>
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h3 className="font-semibold">Приглашения</h3>
          <pre className="mt-2 overflow-auto rounded bg-ios-inset p-3 text-xs text-ios-label-secondary">
            {JSON.stringify(profile.invitesIssued ?? [], null, 2)}
          </pre>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <h3 className="font-semibold">События</h3>
        <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-ios-inset p-3 text-xs text-ios-label-secondary">
          {JSON.stringify(payload.events ?? [], null, 2)}
        </pre>
      </div>
    </div>
  );
}
