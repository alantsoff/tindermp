'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { MessageCircle, Settings, UserRound, Zap } from 'lucide-react';
import { useMatches } from '../_lib/queries';
import { pushWithViewTransition } from '../_lib/view-transition';

const TABS = [
  { href: '/m/feed', label: 'Лента', icon: Zap },
  { href: '/m/matches', label: 'Матчи', icon: MessageCircle },
  { href: '/m/profile', label: 'Профиль', icon: UserRound },
  { href: '/m/settings', label: 'Фильтры', icon: Settings },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: matches } = useMatches();
  const unreadCount = useMemo(() => {
    if (!matches?.length) return 0;
    return matches.reduce((acc, pair) => acc + (pair.hasUnread ? 1 : 0), 0);
  }, [matches]);

  if (pathname.startsWith('/m/onboarding') || pathname.startsWith('/m/invite')) {
    return null;
  }

  return (
    <nav
      aria-label="Разделы"
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{
        bottom:
          'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 14px)',
      }}
    >
      <div
        className="pointer-events-auto glass glass-edge flex items-stretch gap-1 rounded-full px-2 py-1.5"
        style={{ background: 'rgb(var(--material-thick))' }}
      >
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          const showBadge = tab.href === '/m/matches' && unreadCount > 0;
          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => pushWithViewTransition(router, tab.href)}
              aria-current={active ? 'page' : undefined}
              className={[
                'group relative flex min-w-[62px] flex-col items-center gap-0.5 rounded-full px-3 py-1.5',
                'transition-[color,background-color,transform] active:scale-[0.94]',
                active
                  ? 'bg-[rgb(var(--ios-tint)/0.16)] text-[rgb(var(--ios-tint))]'
                  : 'text-[rgb(var(--ios-label-secondary)/0.7)] hover:text-[rgb(var(--ios-label))]',
              ].join(' ')}
              style={{
                transitionDuration: 'var(--dur-base)',
                transitionTimingFunction: 'var(--ease-ios)',
              }}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
                {showBadge ? (
                  <span
                    className="absolute -right-2 -top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                    style={{ background: 'rgb(var(--ios-red))' }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-medium tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
