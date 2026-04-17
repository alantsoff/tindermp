import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-3 text-2xl font-semibold">Match Mini App</h1>
      <p className="mb-5 text-sm text-zinc-400">Открой mini-app в Telegram или перейди в веб-режим для теста.</p>
      <Link href="/m" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold">
        Открыть /m
      </Link>
    </main>
  );
}
