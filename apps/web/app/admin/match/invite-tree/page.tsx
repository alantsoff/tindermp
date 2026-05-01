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
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
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
              className="rounded-lg border border-[rgb(var(--hairline))] px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--ios-fill-1)/0.12)]"
              onClick={async () => {
                setRootProfileId(root.id);
                const result = await matchAdminApi.inviteTree(root.id, depth);
                setTree(result as Record<string, unknown>);
              }}
            >
              <p className="font-medium">{root.displayName}</p>
              <p className="text-xs text-ios-label-tertiary">
                subtree: {root.totalSubtreeSize ?? 1}, score: {root.subtreeSuspicion ?? 0}
              </p>
            </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={rootProfileId}
            onChange={(event) => setRootProfileId(event.target.value)}
            placeholder="root profileId"
            className="w-[320px] rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none"
          />
          <input
            type="number"
            min={1}
            max={6}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
            className="w-24 rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label focus:border-ios-purple focus:outline-none"
          />
          <button
            className="rounded-lg bg-ios-purple px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={async () => {
              const result = await matchAdminApi.inviteTree(rootProfileId, depth);
              setTree(result as Record<string, unknown>);
            }}
          >
            Построить
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
        <h2 className="font-semibold">JSON дерева</h2>
        <pre className="mt-2 max-h-[640px] overflow-auto rounded bg-ios-inset p-3 text-xs text-ios-label-secondary">
          {JSON.stringify(tree, null, 2)}
        </pre>
      </div>
    </div>
  );
}
