'use client';

import type { FeedCard } from '../_lib/api';

export function SwipeCard({ card }: { card: FeedCard }) {
  return (
    <div className="h-[460px] w-full rounded-3xl border border-white/10 bg-zinc-900 p-5 text-white shadow-xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-700 text-xl font-semibold">
          {card.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-lg font-semibold">{card.displayName}</div>
          <div className="text-xs text-zinc-400">{card.roleLabel}</div>
        </div>
      </div>

      {card.headline ? <p className="mb-3 text-sm text-zinc-200">{card.headline}</p> : null}
      {card.bio ? <p className="mb-3 text-sm text-zinc-300">{card.bio}</p> : null}

      {!!card.niches.length && (
        <div className="mb-3">
          <div className="mb-1 text-xs uppercase text-zinc-500">Ниши</div>
          <div className="flex flex-wrap gap-2">
            {card.niches.map((niche) => (
              <span key={niche} className="rounded-full bg-zinc-800 px-2 py-1 text-xs">
                {niche}
              </span>
            ))}
          </div>
        </div>
      )}

      {!!card.skills.length && (
        <div>
          <div className="mb-1 text-xs uppercase text-zinc-500">Навыки</div>
          <div className="flex flex-wrap gap-2">
            {card.skills.map((skill) => (
              <span key={skill} className="rounded-full bg-zinc-800 px-2 py-1 text-xs">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
