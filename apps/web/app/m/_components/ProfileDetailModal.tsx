'use client';

import {
  Briefcase,
  Building2,
  ExternalLink,
  Home,
  MapPin,
  Send,
  Users,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { FeedCard } from '../_lib/api';
import { MARKETPLACE_LABELS, WORK_FORMAT_LABELS } from '../_lib/labels';
import { resolveMediaUrl } from '../_lib/media';
import { getExperienceLabel, getRoleLabel } from '../_lib/role';

type Props = {
  card: FeedCard | null;
  open: boolean;
  onClose: () => void;
};

type BodyProps = {
  card: FeedCard;
  onClose: () => void;
};

function renderWorkFormatIcon(workFormat: string) {
  if (workFormat === 'HYBRID') return <Users size={12} strokeWidth={2.2} />;
  if (workFormat === 'OFFICE') return <Building2 size={12} strokeWidth={2.2} />;
  if (workFormat === 'REMOTE') return <Home size={12} strokeWidth={2.2} />;
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

function ProfileDetailModalBody({ card, onClose }: BodyProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<string[]>([]);

  const photos = useMemo(() => {
    const customPhotos = (card.photos ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((photo) => resolveMediaUrl(photo.url))
      .filter((url) => typeof url === 'string' && url.trim().length > 0);
    const sourcePhotos = card.avatarUrl
      ? [resolveMediaUrl(card.avatarUrl), ...customPhotos]
      : customPhotos;
    const seen = new Set<string>();
    return sourcePhotos.filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [card]);
  const visiblePhotos = useMemo(
    () => photos.filter((url) => !failedPhotoUrls.includes(url)),
    [failedPhotoUrls, photos],
  );

  const safePhotoIndex =
    visiblePhotos.length === 0
      ? 0
      : Math.min(photoIndex, visiblePhotos.length - 1);
  const coverUrl = visiblePhotos[safePhotoIndex] ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const displayName = card.displayName?.trim() || 'Участник';
  const roleLabel =
    getRoleLabel(card.role, card.roleCustom) ||
    card.roleLabel ||
    'Роль не указана';
  const experienceLabel = getExperienceLabel(card.experience);
  const priceLabel = formatPrice(card);
  const canSwitchPhotos = visiblePhotos.length > 1;

  const switchPhoto = (direction: 'prev' | 'next') => {
    if (!canSwitchPhotos) return;
    setPhotoIndex((prev) => {
      const len = visiblePhotos.length;
      if (len === 0) return 0;
      const p = Math.min(prev, len - 1);
      if (direction === 'prev') {
        return p <= 0 ? len - 1 : p - 1;
      }
      return p >= len - 1 ? 0 : p + 1;
    });
  };

  const marketplaces = (card.marketplaces ?? []).map(
    (value) =>
      MARKETPLACE_LABELS[value as keyof typeof MARKETPLACE_LABELS] ?? value,
  );
  const workFormats = (card.workFormats ?? []).map((value) => ({
    value,
    label:
      WORK_FORMAT_LABELS[value as keyof typeof WORK_FORMAT_LABELS] ?? value,
  }));

  const telegramHandle = card.telegramContact?.trim() ?? null;
  const telegramHref = telegramHandle
    ? telegramHandle.startsWith('http')
      ? telegramHandle
      : `https://t.me/${telegramHandle.replace(/^@/, '')}`
    : null;
  const portfolioUrl = card.portfolioUrl?.trim() || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Профиль ${displayName}`}
      className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="animate-backdrop-in absolute inset-0 bg-black/50 backdrop-blur-xl"
      />

      <div
        className="glass glass-edge animate-pop-in relative flex h-[calc(100svh-12px)] max-h-[calc(100svh-12px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] sm:h-auto sm:max-h-[92vh]"
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="absolute right-3 top-3 z-[4] flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md active:scale-[0.94]"
          style={{
            transitionDuration: 'var(--dur-base)',
            transitionTimingFunction: 'var(--ease-ios)',
            transitionProperty: 'transform, background-color, opacity',
          }}
        >
          <X size={18} strokeWidth={2.4} />
        </button>

        <div className="relative h-[320px] w-full shrink-0 overflow-hidden bg-[rgb(var(--ios-fill-1)/0.32)]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={displayName}
              fill
              unoptimized
              sizes="460px"
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

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
            style={{
              background:
                'linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)',
            }}
          />

          {canSwitchPhotos ? (
            <>
              <button
                type="button"
                aria-label="Предыдущее фото"
                className="absolute inset-y-0 left-0 z-[2] w-1/3"
                onClick={() => switchPhoto('prev')}
              />
              <button
                type="button"
                aria-label="Следующее фото"
                className="absolute inset-y-0 right-0 z-[2] w-1/3"
                onClick={() => switchPhoto('next')}
              />
            </>
          ) : null}

          {visiblePhotos.length > 0 ? (
            <div className="absolute left-3 right-14 top-3 z-[3] flex gap-1">
              {visiblePhotos.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setPhotoIndex(idx)}
                  className={[
                    'h-[3px] flex-1 rounded-full transition-opacity',
                    idx === safePhotoIndex ? 'bg-white/95' : 'bg-white/40 hover:bg-white/60',
                  ].join(' ')}
                  aria-label={`Фото ${idx + 1}`}
                />
              ))}
            </div>
          ) : null}

          <div className="absolute bottom-4 left-5 right-5 z-[3]">
            <h2 className="line-clamp-2 text-[26px] font-semibold leading-[1.02] tracking-[-0.02em] text-white">
              {displayName}
            </h2>
            <p className="mt-1 text-[15px] leading-tight text-white/85">
              {roleLabel}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5 pt-3 sm:px-5">
          {card.headline ? (
            <p className="text-[15px] font-medium leading-snug text-[rgb(var(--ios-label))]">
              {card.headline}
            </p>
          ) : null}

          {priceLabel ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--hairline))] bg-[rgb(var(--ios-fill-1)/0.18)] px-3 py-1 text-[14px] font-semibold text-[rgb(var(--ios-label))]">
              {priceLabel}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[rgb(var(--ios-label-secondary)/0.85)]">
            {card.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} strokeWidth={2.2} />
                {card.city}
              </span>
            ) : null}
            {experienceLabel ? (
              <>
                {card.city ? (
                  <span aria-hidden className="opacity-40">
                    •
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Briefcase size={14} strokeWidth={2.2} />
                  {experienceLabel}
                </span>
              </>
            ) : null}
          </div>

          {workFormats.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {workFormats.map((wf) => (
                <span
                  key={wf.value}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.2)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]"
                >
                  {renderWorkFormatIcon(wf.value)}
                  {wf.label}
                </span>
              ))}
            </div>
          ) : null}

          {card.bio ? (
            <section className="mt-5">
              <div className="ios-section-header">О себе</div>
              <p className="text-[14px] leading-[1.4] text-[rgb(var(--ios-label-secondary)/0.92)]">
                {card.bio}
              </p>
            </section>
          ) : null}

          {card.niches?.length ? (
            <section className="mt-5">
              <div className="ios-section-header">Ниши</div>
              <div className="flex flex-wrap gap-2">
                {card.niches.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.18)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {card.skills?.length ? (
            <section className="mt-5">
              <div className="ios-section-header">Навыки</div>
              <div className="flex flex-wrap gap-2">
                {card.skills.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-[rgb(var(--ios-tint)/0.14)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label))]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {card.tools?.length ? (
            <section className="mt-5">
              <div className="ios-section-header">Инструменты</div>
              <div className="flex flex-wrap gap-2">
                {card.tools.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.2)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {marketplaces.length ? (
            <section className="mt-5">
              <div className="ios-section-header">Маркетплейсы</div>
              <div className="flex flex-wrap gap-2">
                {marketplaces.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.18)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]"
                  >
                    {item}
                  </span>
                ))}
                {card.marketplacesCustom ? (
                  <span className="rounded-full border border-white/10 bg-[rgb(var(--ios-fill-1)/0.18)] px-3 py-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.92)]">
                    {card.marketplacesCustom}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {portfolioUrl || telegramHref ? (
            <section className="mt-5 space-y-2">
              {portfolioUrl ? (
                <a
                  href={portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ios-btn-plain flex w-full items-center justify-center gap-2"
                >
                  <ExternalLink size={16} strokeWidth={2.2} />
                  Портфолио
                </a>
              ) : null}
              {telegramHref ? (
                <a
                  href={telegramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ios-btn-tinted flex w-full items-center justify-center gap-2"
                >
                  <Send size={16} strokeWidth={2.2} />
                  {telegramHandle?.startsWith('http')
                    ? 'Telegram'
                    : telegramHandle?.startsWith('@')
                      ? telegramHandle
                      : `@${telegramHandle}`}
                </a>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProfileDetailModal({ card, open, onClose }: Props) {
  if (!open || !card) return null;
  return <ProfileDetailModalBody key={card.id} card={card} onClose={onClose} />;
}
