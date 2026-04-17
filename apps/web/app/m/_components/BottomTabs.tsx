'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Settings, UserRound, Zap } from 'lucide-react';

const TABS = [
  { href: '/m/feed', label: 'Лента', icon: Zap },
  { href: '/m/matches', label: 'Матчи', icon: MessageCircle },
  { href: '/m/profile', label: 'Профиль', icon: UserRound },
  { href: '/m/settings', label: 'Фильтры', icon: Settings },
];

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex w-full max-w-md border-t border-zinc-800 bg-zinc-950/95 px-2 py-2 backdrop-blur">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1 text-[11px] ${
              active ? 'text-violet-300' : 'text-zinc-500'
            }`}
          >
            <Icon size={17} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
