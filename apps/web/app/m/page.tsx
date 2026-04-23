import { Suspense } from 'react';
import { MatchBootstrap } from './_components/MatchBootstrap';

export default function MatchRootPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <div className="ios-spinner" aria-label="Загрузка" />
          <div className="text-[13px] text-[rgb(var(--ios-label-secondary)/0.75)]">
            Инициализируем Match…
          </div>
        </div>
      }
    >
      <MatchBootstrap />
    </Suspense>
  );
}
