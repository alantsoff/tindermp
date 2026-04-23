'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Avatar } from '../_components/Avatar';
import { ProfileDetailModal } from '../_components/ProfileDetailModal';
import { formatRelativeShort } from '../_lib/relative-time';
import { getRoleLabel } from '../_lib/role';
import {
  useArchivePair,
  useMatchPartner,
  useMatches,
  useUnarchivePair,
} from '../_lib/queries';

const EMPTY_MATCHES: NonNullable<ReturnType<typeof useMatches>['data']> = [];

type FilterKey = 'all' | 'unread' | 'archived';

function FilterPill({
  value,
  label,
  active,
  onSelect,
}: {
  value: FilterKey;
  label: string;
  active: boolean;
  onSelect: (value: FilterKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        'rounded-full px-3 py-1.5 text-[13px] font-semibold active:scale-[0.94]',
        active
          ? 'text-white'
          : 'glass-ultra-thin border border-[rgb(var(--hairline))] text-[rgb(var(--ios-label))]',
      ].join(' ')}
      style={{
        ...(active ? { background: 'rgb(var(--ios-tint))' } : {}),
        transitionDuration: 'var(--dur-base)',
        transitionTimingFunction: 'var(--ease-ios)',
        transitionProperty: 'transform, background-color, opacity',
      }}
    >
      {label}
    </button>
  );
}

export default function MatchesPage() {
  const { data, isLoading } = useMatches();
  const archivePair = useArchivePair();
  const unarchivePair = useUnarchivePair();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openedPairId, setOpenedPairId] = useState<string | null>(null);
  const { data: openedPartner } = useMatchPartner(openedPairId ?? '', Boolean(openedPairId));
  const list = data ?? EMPTY_MATCHES;
  const showTools = list.length >= 10;
  const unreadCount = list.reduce(
    (acc, item) => acc + (item.hasUnread ? 1 : 0),
    0,
  );
  const filtered = useMemo(() => {
    if (!list.length) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return list.filter((pair) => {
      if (filter === 'unread' && !pair.hasUnread) return false;
      if (filter === 'archived' && !pair.isArchived) return false;
      if (filter === 'all' && pair.isArchived) return false;
      if (filter === 'unread' && pair.isArchived) return false;
      if (!normalizedQuery) return true;
      const role =
        getRoleLabel(pair.partner?.role, pair.partner?.roleCustom) ?? '';
      const haystack = [
        pair.partner?.displayName ?? '',
        role,
        ...(pair.partner?.niches ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [list, filter, query]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ios-spinner" aria-label="Загрузка" />
      </div>
    );
  }

  if (!list.length) {
    return (
      <div>
        <div className="glass glass-edge mt-4 rounded-[22px] p-8 text-center">
          <p className="text-[15px] text-[rgb(var(--ios-label-secondary)/0.85)]">
            Пока нет матчей.
          </p>
          <p className="mt-1 text-[13px] text-[rgb(var(--ios-label-secondary)/0.6)]">
            Лайкайте людей в ленте — взаимные лайки появятся здесь.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showTools ? (
        <>
          <div className="relative mb-3">
            <Search
              size={16}
              strokeWidth={2.2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ios-label-secondary)/0.55)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по имени или нише"
              className="ios-input pl-9"
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <FilterPill
              value="all"
              label={`Все · ${list.length}`}
              active={filter === 'all'}
              onSelect={setFilter}
            />
            <FilterPill
              value="unread"
              label={`Непрочитанные${unreadCount ? ` · ${unreadCount}` : ''}`}
              active={filter === 'unread'}
              onSelect={setFilter}
            />
            <FilterPill
              value="archived"
              label="Архив"
              active={filter === 'archived'}
              onSelect={setFilter}
            />
          </div>
        </>
      ) : null}
      <div className="ios-group">
        {filtered.map((pair) => {
          const roleLabel = getRoleLabel(
            pair.partner?.role,
            pair.partner?.roleCustom,
          );
          const previewText = pair.isFirstMessageSystemOnly
            ? 'Новый матч — напишите первым'
            : pair.lastMessage?.body ?? 'Новый матч — напишите первым';
          return (
            <div
              key={pair.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => setOpenedPairId(pair.id)}
                className="shrink-0 rounded-full active:scale-[0.96]"
                aria-label={`Открыть профиль ${pair.partner?.displayName ?? 'собеседника'}`}
              >
                <Avatar
                  name={pair.partner?.displayName ?? 'С'}
                  url={pair.partner?.avatarUrl}
                  size={52}
                />
              </button>
              <Link href={`/m/matches/${pair.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenedPairId(pair.id);
                      }}
                      className="truncate text-left text-[15px] font-semibold active:opacity-75"
                    >
                      {pair.partner?.displayName ?? 'Собеседник'}
                    </button>
                    <span className="shrink-0 text-[12px] text-[rgb(var(--ios-label-secondary)/0.55)]">
                      {formatRelativeShort(pair.lastMessageAt ?? pair.createdAt)}
                    </span>
                  </div>
                  <div className="truncate text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                    {roleLabel}
                    {pair.partner?.niches?.length
                      ? ` · ${pair.partner.niches.slice(0, 2).join(', ')}`
                      : ''}
                  </div>
                  <div
                    className={[
                      'mt-0.5 truncate text-[13.5px]',
                      pair.hasUnread
                        ? 'font-semibold text-[rgb(var(--ios-label))]'
                        : 'text-[rgb(var(--ios-label-secondary)/0.8)]',
                    ].join(' ')}
                  >
                    {previewText}
                  </div>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {pair.hasUnread ? (
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: 'rgb(var(--ios-tint))' }}
                  />
                ) : null}
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium active:scale-[0.94]"
                  style={{
                    color: 'rgb(var(--ios-tint))',
                    background: 'rgb(var(--ios-tint) / 0.12)',
                    transitionDuration: 'var(--dur-base)',
                    transitionTimingFunction: 'var(--ease-ios)',
                    transitionProperty: 'transform, background-color, opacity',
                  }}
                  onClick={() =>
                    pair.isArchived
                      ? void unarchivePair.mutateAsync(pair.id)
                      : void archivePair.mutateAsync(pair.id)
                  }
                >
                  {pair.isArchived ? 'В ленту' : 'В архив'}
                </button>
              </div>
            </div>
          );
        })}
        {!filtered.length ? (
          <div className="px-4 py-6 text-center text-[13px] text-[rgb(var(--ios-label-secondary)/0.7)]">
            Ничего не найдено по текущему фильтру.
          </div>
        ) : null}
      </div>

      <ProfileDetailModal
        open={Boolean(openedPairId && openedPartner)}
        card={openedPartner ?? null}
        onClose={() => setOpenedPairId(null)}
      />
    </div>
  );
}
