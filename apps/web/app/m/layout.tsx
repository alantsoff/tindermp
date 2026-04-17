import Script from 'next/script';
import type { ReactNode } from 'react';
import { BottomTabs } from './_components/BottomTabs';

export default function MatchLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div className="mx-auto min-h-screen max-w-md px-4 pb-20 pt-4">{children}</div>
      <BottomTabs />
    </div>
  );
}
