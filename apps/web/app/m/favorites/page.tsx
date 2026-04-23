'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Heart, MapPin, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar } from '../_components/Avatar';
import { formatRelativeShort } from '../_lib/relative-time';
import { getRoleLabel } from '../_lib/role';
import { useFavorites, useRemoveFavorite } from '../_lib/queries';

export default function MatchFavoritesPage() {
  const router = useRouter();
  const { data, isLoading } = useFavorites();
  const removeFavorite = useRemoveFavorite();
  const [toast, setToast] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ios-spinner" aria-label="Загрузка" />
      </div>
    );
  }

  const items = data ?? [];

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full active:scale-[0.94]"
          style={{
            color: 'rgb(var(--ios-tint))',
            background: 'rgb(var(--ios-tint) / 0.12)',
            transitionDuration: 'var(--dur-base)',
            transitionTimingFunction: 'var(--ease-ios)',
            transitionProperty: 'transform, background-color, opacity',
          }}
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
        <div className="flex-1">
          <h1 className="ios-title-large">Избранное</h1>
          <p className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.8)]">
            Кому вы поставили лайк, но они пока не ответили.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="glass glass-edge rounded-[22px] p-8 text-center">
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'rgb(var(--ios-pink) / 0.18)' }}
          >
            <Heart
              size={24}
              strokeWidth={2.4}
              style={{ color: 'rgb(var(--ios-pink))' }}
            />
          </div>
          <p className="text-[15px] text-[rgb(var(--ios-label))]">
            Пока пусто
          </p>
          <p className="mt-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
            Лайкнутые профили будут появляться здесь. Как только будет взаимный
            лайк — переедут в «Матчи».
          </p>
          <Link href="/m/feed" className="ios-btn-primary mt-4 inline-flex">
            Открыть ленту
          </Link>
        </div>
      ) : (
        <div className="ios-group">
          {items.map((item) => {
            const roleLabel = getRoleLabel(
              item.partner.role,
              item.partner.roleCustom,
            );
            const pausedBadge = !item.partner.isAvailable;
            return (
              <div
                key={item.swipeId}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Avatar
                  name={item.partner.displayName}
                  url={item.partner.avatarUrl}
                  size={52}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold">
                      {item.partner.displayName}
                    </span>
                    {item.isSuperLike ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[10px] font-semibold"
                        style={{
                          color: 'rgb(var(--ios-tint))',
                          background: 'rgb(var(--ios-tint) / 0.14)',
                        }}
                      >
                        <Sparkles size={10} strokeWidth={2.4} />
                        Super
                      </span>
                    ) : null}
                    {pausedBadge ? (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[10px] font-semibold"
                        style={{
                          color: 'rgb(var(--ios-label-secondary))',
                          background: 'rgb(var(--ios-fill-1) / 0.2)',
                        }}
                      >
                        недоступен
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[12px] text-[rgb(var(--ios-label-secondary)/0.75)]">
                    {roleLabel ?? '—'}
                    {item.partner.city ? (
                      <>
                        <span className="mx-1">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin size={10} strokeWidth={2.2} />
                          {item.partner.city}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {item.partner.headline ? (
                    <div className="mt-0.5 truncate text-[13px] text-[rgb(var(--ios-label))]">
                      {item.partner.headline}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[11px] text-[rgb(var(--ios-label-secondary)/0.55)]">
                    Лайк · {formatRelativeShort(item.likedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Убрать из избранного"
                  disabled={removeFavorite.isPending}
                  onClick={() => {
                    void removeFavorite
                      .mutateAsync(item.partner.id)
                      .catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : '';
                        setToast(
                          message.includes('favorite_is_match')
                            ? 'Этот контакт уже в матчах'
                            : 'Не удалось удалить из избранного',
                        );
                      });
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-[0.94] disabled:opacity-50"
                  style={{
                    color: 'rgb(var(--ios-red))',
                    background: 'rgb(var(--ios-red) / 0.14)',
                    transitionDuration: 'var(--dur-base)',
                    transitionTimingFunction: 'var(--ease-ios)',
                    transitionProperty: 'transform, background-color, opacity',
                  }}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {toast ? (
        <div
          className="glass glass-edge rounded-2xl px-4 py-2.5 text-[14px]"
          style={{
            borderColor: 'rgb(var(--ios-red) / 0.3)',
            color: 'rgb(var(--ios-red))',
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
