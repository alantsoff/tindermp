'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Filter,
  HelpCircle,
  Heart,
  Share,
  Ticket,
  Trash2,
  User,
} from 'lucide-react';
import {
  ACTIVITY_QUADRANT_COPY,
  ActivityQuadrant,
} from '../_components/ActivityQuadrant';
import { Avatar } from '../_components/Avatar';
import { PhotoGallery } from '../_components/PhotoGallery';
import { SwipeCard } from '../_components/SwipeCard';
import { WelcomeTutorial } from '../_components/WelcomeTutorial';
import type { FeedCard } from '../_lib/api';
import {
  useFavorites,
  useInvites,
  useMatchMe,
  useRevokeInvite,
  useSwipeResetPreview,
} from '../_lib/queries';
import { getExperienceLabel, getRoleLabel } from '../_lib/role';
import { formatRelativeShort } from '../_lib/relative-time';
import { pushWithViewTransition } from '../_lib/view-transition';

function formatResetCountdown(nextAt?: string | null): string {
  if (!nextAt) return 'скоро';
  const ms = new Date(nextAt).getTime() - Date.now();
  if (ms <= 0) return 'сейчас';
  const totalHours = Math.ceil(ms / (60 * 60 * 1000));
  if (totalHours < 24) return `${totalHours} ч`;
  return `${Math.ceil(totalHours / 24)} дн`;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
        {label}
      </span>
      <span className="text-right text-[15px] text-[rgb(var(--ios-label))]">
        {value || '—'}
      </span>
    </div>
  );
}

export default function MatchProfilePage() {
  const router = useRouter();
  const { data, isLoading } = useMatchMe();
  const { data: invites } = useInvites();
  const { data: resetPreview } = useSwipeResetPreview();
  const { data: favorites, isLoading: favoritesLoading } = useFavorites();
  const revokeInvite = useRevokeInvite();
  const favoritesCount = favorites?.length ?? 0;
  // Re-openable onboarding tutorial — triggered by the "Как пользоваться"
  // button at the top of the profile. Hooks must come before the early
  // returns below (Rules of Hooks).
  const [showTutorial, setShowTutorial] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ios-spinner" aria-label="Загрузка" />
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-[15px] text-[rgb(var(--ios-label-secondary)/0.85)]">
          Профиль ещё не создан.
        </p>
        <Link className="ios-btn-primary inline-flex" href="/m/onboarding">
          Пройти онбординг
        </Link>
      </div>
    );
  }

  const profile = data.profile;
  const settings = data.settings;
  const activated = invites?.used ?? [];
  const activeFilterCount =
    (settings?.interestedRoles.length ?? 0) +
    (settings?.interestedNiches.length ?? 0) +
    (settings?.interestedWorkFormats.length ?? 0) +
    (settings?.interestedMarketplaces.length ?? 0) +
    (settings?.sameCityOnly ? 1 : 0);
  const profilePreviewCard: FeedCard = {
    ...profile,
    roleLabel:
      (profile.role === 'CUSTOM'
        ? profile.roleCustom ?? 'Свой вариант'
        : getRoleLabel(profile.role)) ?? profile.role,
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Повторный запуск обучалки */}
      <button
        type="button"
        onClick={() => setShowTutorial(true)}
        className="glass glass-edge flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--ios-tint)), rgb(var(--ios-pink)))',
            boxShadow: '0 8px 20px -8px rgb(var(--ios-tint) / 0.5)',
          }}
        >
          <HelpCircle size={18} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[rgb(var(--ios-label))]">
            Как пользоваться
          </span>
          <span className="block text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
            Короткая обучалка по свайпам, матчам и инвайтам
          </span>
        </span>
        <span
          aria-hidden
          className="text-[rgb(var(--ios-label-tertiary)/0.6)]"
        >
          ›
        </span>
      </button>

      {/* Как видят мой профиль */}
      <section>
        <div className="ios-section-header">Как видят мой профиль</div>
        <SwipeCard card={profilePreviewCard} preview />
      </section>

      {/* Ваша активность — приватный блок для самого пользователя. */}
      {data.activity ? (
        <section>
          <div className="ios-section-header">Ваша активность</div>
          <div className="glass glass-edge space-y-4 rounded-2xl p-4">
            <div className="flex justify-center">
              <ActivityQuadrant active={data.activity.quadrant} />
            </div>
            <div className="ios-group">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                  Лайков отправлено
                </span>
                <span className="text-[15px] font-medium">
                  {data.activity.likesSent14d}
                  <span className="ml-1 text-[12px] font-normal text-[rgb(var(--ios-label-secondary)/0.6)]">
                    за 14 дней
                  </span>
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                  Взаимных
                </span>
                <span className="text-[15px] font-medium">
                  {data.activity.matches14d} из {data.activity.likesSent14d}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                  Вас лайкнули
                </span>
                <span className="text-[15px] font-medium">
                  {data.activity.likesReceived14d}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                  Дней с нами
                </span>
                <span className="text-[15px] font-medium">
                  {data.activity.accountAgeDays}
                </span>
              </div>
            </div>
            <div
              className="rounded-2xl p-4 text-[14px] leading-snug"
              style={{
                background: 'rgb(var(--ios-tint) / 0.08)',
                color: 'rgb(var(--ios-label))',
              }}
            >
              <div className="mb-1 text-[13px] font-semibold text-[rgb(var(--ios-tint))]">
                {ACTIVITY_QUADRANT_COPY[data.activity.quadrant].title}
              </div>
              {ACTIVITY_QUADRANT_COPY[data.activity.quadrant].body}
            </div>
          </div>
        </section>
      ) : null}

      {/* О себе */}
      <section>
        <div className="ios-section-header flex items-center gap-2">
          <User size={14} /> О себе
        </div>
        <div className="ios-group">
          <InfoRow label="Опыт" value={getExperienceLabel(profile.experience)} />
          <InfoRow label="Ниши" value={profile.niches.join(', ')} />
          <InfoRow label="Навыки" value={profile.skills.join(', ')} />
          <InfoRow label="Инструменты" value={profile.tools?.join(', ')} />
          <InfoRow label="Контакт" value={profile.telegramContact} />
        </div>
      </section>

      {/* Кого ищу */}
      <section>
        <div className="ios-section-header flex items-center justify-between gap-2 pr-4">
          <span className="flex items-center gap-2">
            <Filter size={14} /> Кого ищу
          </span>
          <Link
            href="/m/settings"
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              color: 'rgb(var(--ios-tint))',
              background: 'rgb(var(--ios-tint) / 0.14)',
            }}
          >
            {activeFilterCount} фильтров · открыть
          </Link>
        </div>
        <div className="ios-group">
          <InfoRow
            label="Роли"
            value={
              settings?.interestedRoles.length
                ? settings.interestedRoles
                    .map((role) => getRoleLabel(role))
                    .join(', ')
                : 'все'
            }
          />
          <InfoRow
            label="Ниши"
            value={settings?.interestedNiches.join(', ') || 'все'}
          />
        </div>
      </section>

      {/* Избранное */}
      <section>
        <div className="ios-section-header flex items-center gap-2">
          <Heart size={14} /> Избранное
        </div>
        {favoritesLoading ? (
          <div className="h-[56px] animate-pulse rounded-xl bg-[rgb(var(--ios-fill-1)/0.14)]" />
        ) : (
          <button
            type="button"
            onClick={() => pushWithViewTransition(router, '/m/favorites')}
            className="ios-group flex w-full items-center px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">
                Понравились вам
              </div>
              <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                {favoritesCount > 0
                  ? `${favoritesCount} ${
                      favoritesCount % 10 === 1 && favoritesCount % 100 !== 11
                        ? 'профиль'
                        : favoritesCount % 10 >= 2 &&
                            favoritesCount % 10 <= 4 &&
                            (favoritesCount % 100 < 12 ||
                              favoritesCount % 100 > 14)
                          ? 'профиля'
                          : 'профилей'
                    } · ждут ответного лайка`
                  : 'Пока пусто. Лайки из ленты появятся здесь.'}
              </div>
            </div>
          </button>
        )}
      </section>

      {/* Фото */}
      <section>
        <div className="ios-section-header">Фото профиля</div>
        <div className="glass glass-edge rounded-2xl p-3">
          <PhotoGallery
            photos={profile.photos ?? []}
            defaultPhotoUrl={profile.avatarUrl}
            editable
          />
        </div>
      </section>

      {resetPreview?.autoResetEnabled ? (
        <p className="rounded-2xl px-4 py-2.5 text-[12px] text-[rgb(var(--ios-label-secondary)/0.8)]">
          Автообновление ленты через {formatResetCountdown(resetPreview.nextAutoResetAt)}.
        </p>
      ) : null}

      <div>
        <Link
          href="/m/onboarding"
          className="ios-btn-tinted inline-flex w-full items-center justify-center"
        >
          Редактировать профиль
        </Link>
      </div>

      {/* Приглашения */}
      {invites ? (
        <section id="invites">
          <div className="ios-section-header flex items-center gap-2">
            <Ticket size={14} /> Приглашения · {invites.stats.invitesAvailable} из{' '}
            {invites.stats.invitesIssued}
          </div>

          {activated.length > 0 ? (
            <div className="glass glass-edge mb-3 rounded-2xl p-4">
              <div className="mb-2 text-[13px] font-semibold">
                По вашим кодам присоединились ({activated.length})
              </div>
              <ul className="space-y-2">
                {activated.map((item) => (
                  <li key={item.code} className="flex items-center gap-3">
                    <Avatar name={item.invitee?.displayName ?? '—'} size={36} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px]">
                        {item.invitee?.displayName ?? '—'}
                      </div>
                      <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                        {item.invitee?.role
                          ? getRoleLabel(item.invitee.role) ||
                            item.invitee.roleCustom ||
                            '—'
                          : '—'}
                        {' · '}
                        {formatRelativeShort(item.usedAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ios-group">
            {invites.all.map((invite) => {
              const origin =
                typeof window !== 'undefined' ? window.location.origin : '';
              const fallbackUrl = `${origin}/m?invite=${invite.code}`;
              const deepLinkBase =
                process.env.NEXT_PUBLIC_TELEGRAM_MINIAPP_LINK?.trim() ?? '';
              const miniAppUrl = deepLinkBase
                ? `${deepLinkBase}${deepLinkBase.includes('?') ? '&' : '?'}startapp=${encodeURIComponent(`invite_${invite.code}`)}`
                : fallbackUrl;
              const isAvailable = !invite.usedAt && !invite.revokedAt;
              const isUsed = !!invite.usedAt;
              const status = isAvailable
                ? 'активен'
                : isUsed
                  ? 'использован'
                  : 'отозван';
              const statusColor = isAvailable
                ? 'rgb(var(--ios-green))'
                : isUsed
                  ? 'rgb(var(--ios-label-secondary) / 0.7)'
                  : 'rgb(var(--ios-red))';

              return (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p
                      className="font-mono text-[15px] font-semibold tracking-[0.2em] text-[rgb(var(--ios-label))]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {invite.code}
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: statusColor }}
                    >
                      {status}
                      {invite.invitee
                        ? ` · ${invite.invitee.displayName ?? 'пользователь'}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isUsed ? (
                      <button
                        type="button"
                        aria-label="Копировать код"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--ios-label))] active:scale-[0.94]"
                        style={{
                          background: 'rgb(var(--ios-fill-1)/0.16)',
                          transitionDuration: 'var(--dur-base)',
                          transitionTimingFunction: 'var(--ease-ios)',
                          transitionProperty: 'transform, background-color, opacity',
                        }}
                        onClick={async () => {
                          await navigator.clipboard.writeText(invite.code);
                        }}
                      >
                        <Copy size={14} strokeWidth={2.2} />
                      </button>
                    ) : null}
                    {isAvailable ? (
                      <>
                        <button
                          type="button"
                          aria-label="Поделиться"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-white active:scale-[0.94]"
                          style={{
                            background: 'rgb(var(--ios-tint))',
                            transitionDuration: 'var(--dur-base)',
                            transitionTimingFunction: 'var(--ease-ios)',
                            transitionProperty: 'transform, background-color, opacity',
                          }}
                          onClick={async () => {
                            const tg =
                              typeof window !== 'undefined'
                                ? window.Telegram?.WebApp
                                : undefined;
                            const shareText = encodeURIComponent(
                              `Бот: @tindermp_bot\n\nЭто код для входа:\n${invite.code}`,
                            );
                            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
                              miniAppUrl,
                            )}&text=${shareText}`;
                            const opener = tg as
                              | { openTelegramLink?: (value: string) => void }
                              | undefined;
                            if (opener?.openTelegramLink) {
                              opener.openTelegramLink(shareUrl);
                            } else {
                              await navigator.clipboard.writeText(miniAppUrl);
                            }
                          }}
                        >
                          <Share size={14} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          aria-label="Отозвать"
                          className="flex h-8 w-8 items-center justify-center rounded-full active:scale-[0.94]"
                          style={{
                            color: 'rgb(var(--ios-red))',
                            background: 'rgb(var(--ios-red) / 0.14)',
                            transitionDuration: 'var(--dur-base)',
                            transitionTimingFunction: 'var(--ease-ios)',
                            transitionProperty: 'transform, background-color, opacity',
                          }}
                          onClick={() => void revokeInvite.mutateAsync(invite.code)}
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-[rgb(var(--ios-label-secondary)/0.6)]">
            {invites.stats.nextGrantAt
              ? `Следующий код начислится: ${new Date(
                  invites.stats.nextGrantAt,
                ).toLocaleDateString('ru-RU')}`
              : 'Потолок приглашений достигнут, используйте текущие коды.'}
          </p>
        </section>
      ) : null}

      <WelcomeTutorial
        open={showTutorial}
        onFinish={() => setShowTutorial(false)}
      />
    </div>
  );
}
