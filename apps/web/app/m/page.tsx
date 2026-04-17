import { Suspense } from 'react';
import { MatchBootstrap } from './_components/MatchBootstrap';

export default function MatchRootPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-zinc-400">Инициализируем Match…</div>}>
      <MatchBootstrap />
    </Suspense>
  );
}
