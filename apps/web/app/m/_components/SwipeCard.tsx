'use client';

import { Building2, Flame, Home, MapPin, Sparkles, Users } from 'lucide-react';
import Image from 'next/image';
import { memo, useEffect, useMemo, useState } from 'react';
import type { ActivityBadge, FeedCard } from '../_lib/api';
import { MARKETPLACE_SHORT } from '../_lib/labels';
import { resolveMediaUrl } from '../_lib/media';
import { getExperienceLabel, getRoleLabel } from '../_lib/role';

// Positive-only badges. Never add a "new profile" or "inactive" variant —
// see docs/CURSOR_TASKS_ACTIVITY_SCORE.md §4.1 for the rationale.
const ACTIVITY_BADGE_META: Record<
  ActivityBadge,
  { label: string; tone: string; Icon: typeof Flame }
> = {
  ACTIVE_TODAY: {
    label: 'Активен сегодня',
    tone: 'var(--ios-green)',
    Icon: Flame,
  },
  WEEKLY_TOP: {
    label: 'В топе недели',
    tone: 'var(--ios-tint)',
    Icon: Sparkles,
  },
};

function renderWorkFormatIcon(workFormats: string[]) {
  if (workFormats.includes('HYBRID')) return <Users size={12} strokeWidth={2.2} />;
  if (workFormats.includes('OFFICE')) return <Building2 size={12} strokeWidth={2.2} />;
  if (workFormats.includes('REMOTE')) return <Home size={12} strokeWidth={2.2} />;
  return null;
}

function renderWorkFormatLabel(workFormats: string[]): string | null {
  if (workFormats.includes('HYBRID')) return 'гибрид';
  if (workFormats.includes('OFFICE')) return 'офис';
  if (workFormats.includes('REMOTE')) return 'удалённо';
  return null;
}

function formatPrice(card: FeedCard): string | null {
  const { priceMin, priceMax, currency } = card;
  if (
    typeof priceMin !== 'number' ||
    typeof priceMax !== 'number' ||
    priceMin < 0 ||
    priceMax < 0
  ) {
    return null;
  }

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
  const symbol = currency === 'RUB' ? '₽' : currency;

  if (priceMin === priceMax) return `${formatAmount(priceMin)} ${symbol}/час`;
  return `${formatAmount(priceMin)}–${formatAmount(priceMax)} ${symbol}/час`;
}

export const SwipeCard = memo(function SwipeCard({
  card,
  preview = false,
}: {
  card: FeedCard;
  preview?: boolean;
}) {
  const displayName = card.displayName?.trim() || 'Участник';
  /** После mount в resolveMediaUrl доступен window.location.origin (важно для /match-media). */
  const [mediaResolveTick, setMediaResolveTick] = useState(0);
  useEffect(() => {
    setMediaResolveTick(1);
  }, []);
  const photos = useMemo(() => {
    void mediaResolveTick; // after mount, origin is set — re-run resolveMediaUrl
    const customPhotoUrls = (card.photos ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((photo) => photo.url);
    if (card.avatarUrl && !customPhotoUrls.includes(card.avatarUrl)) {
      return [resolveMediaUrl(card.avatarUrl), ...customPhotoUrls.map(resolveMediaUrl)];
    }
    return customPhotoUrls.map(resolveMediaUrl);
  }, [card.photos, card.avatarUrl, mediaResolveTick]);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoCardId, setPhotoCardId] = useState(card.id);
  const visiblePhotos = useMemo(
    () => photos.filter((u) => !failedPhotoUrls.includes(u)),
    [failedPhotoUrls, photos],
  );
  useEffect(() => {
    setFailedPhotoUrls([]);
    setPhotoIndex(0);
  }, [card.id]);
  useEffect(() => {
    if (visiblePhotos.length === 0) return;
    setPhotoIndex((i) => Math.min(i, visiblePhotos.length - 1));
  }, [visiblePhotos.length, failedPhotoUrls.length]);
  const effectivePhotoIndex = photoCardId === card.id ? photoIndex : 0;
  const safePhotoIndex =
    effectivePhotoIndex >= 0 && effectivePhotoIndex < visiblePhotos.length
      ? effectivePhotoIndex
      : 0;
  const marketplaceBadges = (card.marketplaces ?? [])
    .slice(0, 4)
    .map(
      (value) =>
        MARKETPLACE_SHORT[value as keyof typeof MARKETPLACE_SHORT] ?? value,
    );
  const overflowCount = Math.max((card.marketplaces?.length ?? 0) - 4, 0);
  const coverUrl = visiblePhotos[safePhotoIndex] ?? visiblePhotos[0] ?? null;
  const canSwitchPhotos = visiblePhotos.length > 1;
  const priceLabel = formatPrice(card);
  const experienceLabel = getExperienceLabel(card.experience);
  const geoParts = [
    card.city?.trim() || null,
    renderWorkFormatLabel(card.workFormats ?? []),
    experienceLabel,
  ].filter(Boolean);
  const chipItems = (card.skills?.length ? card.skills : card.niches).slice(0, 6);
  const displayRoleLabel =
    getRoleLabel(card.role, card.roleCustom) ||
    card.roleLabel ||
    'Роль не указана';
  const displayNameFontSize = useMemo(() => {
    const length = Array.from(displayName).length;
    if (length <= 10) return 'clamp(1.8rem, 7vw, 2.2rem)';
    if (length <= 14) return 'clamp(1.55rem, 6vw, 1.9rem)';
    if (length <= 18) return 'clamp(1.3rem, 5vw, 1.65rem)';
    return 'clamp(1.02rem, 4.2vw, 1.35rem)';
  }, [displayName]);

  const switchPhoto = (direction: 'prev' | 'next') => {
    if (!canSwitchPhotos) return;
    setPhotoCardId(card.id);
    setPhotoIndex((prev) => {
      const current = photoCardId === card.id ? prev : 0;
      const n = visiblePhotos.length;
      if (direction === 'prev') {
        return current <= 0 ? n - 1 : current - 1;
      }
      return current >= n - 1 ? 0 : current + 1;
    });
  };

  return (
    <article
      className={[
        'match-swipe-card glass-edge relative h-[500px] w-full overflow-hidden rounded-[28px] px-5 pb-5 pt-4',
        preview ? 'ring-1 ring-[rgb(var(--ios-tint)/0.45)]' : '',
      ].join(' ')}
    >
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {preview ? (
            <div className="text-[11px] font-medium text-[rgb(var(--ios-label-secondary)/0.75)]">
              Так вас увидят другие
            </div>
          ) : null}
          <h2
            className="mt-3 line-clamp-2 whitespace-normal break-words font-semibold leading-[0.94] tracking-[-0.02em] text-[rgb(var(--ios-label))]"
            style={{ fontSize: displayNameFontSize }}
            title={displayName}
          >
            {displayName}
          </h2>
          <p className="mt-2 line-clamp-2 text-[17px] leading-tight text-[rgb(var(--ios-label-secondary)/0.9)]">
            {displayRoleLabel}
          </p>
          {card.activityBadge ? (
            (() => {
              const meta = ACTIVITY_BADGE_META[card.activityBadge];
              const BadgeIcon = meta.Icon;
              return (
                <span
                  className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: `rgb(${meta.tone})`,
                    background: `rgb(${meta.tone} / 0.14)`,
                  }}
                >
                  <BadgeIcon size={11} strokeWidth={2.4} />
                  {meta.label}
                </span>
              );
            })()
          ) : null}
        </div>

        <div className="relative aspect-[0.86] w-[48%] shrink-0 overflow-hidden rounded-[26px] border border-white/10 bg-[rgb(var(--ios-fill-1)/0.32)]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={card.displayName}
              fill
              unoptimized
              sizes="60vw"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => {
                setFailedPhotoUrls((prev) =>
                  prev.includes(coverUrl) ? prev : [...prev, coverUrl],
                );
              }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.12) 0px, rgb(255 255 255 / 0.12) 2px, transparent 2px, transparent 18px), linear-gradient(135deg, rgb(var(--ios-pink)/0.75), rgb(var(--ios-orange)/0.7))',
              }}
            />
          )}

          {canSwitchPhotos ? (
            <>
              <button
                type="button"
                aria-label="Предыдущее фото"
                className="absolute inset-y-0 left-0 z-[2] w-1/2"
                onClick={() => switchPhoto('prev')}
              />
              <button
                type="button"
                aria-label="Следующее фото"
                className="absolute inset-y-0 right-0 z-[2] w-1/2"
                onClick={() => switchPhoto('next')}
              />
            </>
          ) : null}

          {visiblePhotos.length > 1 ? (
            <div className="absolute left-3 right-3 top-2 z-[3] flex gap-1">
              {visiblePhotos.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    setPhotoCardId(card.id);
                    setPhotoIndex(idx);
                  }}
                  className={[
                    'h-[3px] flex-1 rounded-full transition-opacity',
                    idx === safePhotoIndex ? 'bg-white/95' : 'bg-white/40 hover:bg-white/60',
                  ].join(' ')}
                  aria-label={`Фото ${idx + 1}`}
                />
              ))}
            </div>
          ) : null}

          {!coverUrl ? (
            <span className="absolute bottom-3 left-3 text-[12px] uppercase tracking-[0.2em] text-white/85">
              фото
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {priceLabel ? (
          <div className="text-[16px] font-semibold leading-[0.95] tracking-[-0.02em] text-[rgb(var(--ios-label))]">
            {priceLabel}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[rgb(var(--ios-label-secondary)/0.78)]">
          {geoParts.length ? (
            <span className="inline-flex items-center gap-1">
              {renderWorkFormatIcon(card.workFormats ?? []) ?? <MapPin size={14} strokeWidth={2.2} />}
              {geoParts.join(' · ')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} strokeWidth={2.2} />
              Город не указан
            </span>
          )}
          {marketplaceBadges.length ? (
            <>
              <span aria-hidden className="opacity-40">
                •
              </span>
              <span>{marketplaceBadges.join(' · ')}</span>
              {overflowCount > 0 ? <span>+{overflowCount}</span> : null}
            </>
          ) : null}
        </div>

        {chipItems.length ? (
          <div className="flex flex-wrap gap-2">
            {chipItems.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.18)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}

        {card.bio ? (
          <p className="mt-5 border-t border-[rgb(var(--hairline))] pt-5 text-[13.33px] leading-[1.12] tracking-[-0.02em] text-[rgb(var(--ios-label-secondary)/0.86)]">
            {card.bio}
          </p>
        ) : null}
      </div>
    </article>
  );
});
