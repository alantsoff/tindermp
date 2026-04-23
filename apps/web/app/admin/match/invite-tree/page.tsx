'use client';

import { useState } from 'react';
import { matchAdminApi } from '../_lib/api';
import { useAdminRoots } from '../_lib/queries';

export default function MatchAdminInviteTreePage() {
  const { data: roots } = useAdminRoots();
  const [rootProfileId, setRootProfileId] = useState('');
  const [tree, setTree] = useState<Record<string, unknown> | null>(null);
  const [depth, setDepth] = useState(3);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">Топ корней</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {(roots ?? []).map((raw) => {
            const root = raw as {
              id: string;
              displayName: string;
              totalSubtreeSize?: number;
              subtreeSuspicion?: number;
            };
            return (
            <button
              key={root.id}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm hover:border-zinc-700"
              onClick={async () => {
                setRootProfileId(root.id);
                const result = await matchAdminApi.inviteTree(root.id, depth);
                setTree(result as Record<string, unknown>);
              }}
            >
              <p className="font-medium">{root.displayName}</p>
              <p className="text-xs text-zinc-500">
                subtree: {root.totalSubtreeSize ?? 1}, score: {root.subtreeSuspicion ?? 0}
              </p>
            </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={rootProfileId}
            onChange={(event) => setRootProfileId(event.target.value)}
            placeholder="root profileId"
            className="w-[320px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={6}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
            className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm"
            onClick={async () => {
              const result = await matchAdminApi.inviteTree(rootProfileId, depth);
              setTree(result as Record<string, unknown>);
            }}
          >
            Построить
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="font-semibold">JSON дерева</h2>
        <pre className="mt-2 max-h-[640px] overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
          {JSON.stringify(tree, null, 2)}
        </pre>
      </div>
    </div>
  );
}
