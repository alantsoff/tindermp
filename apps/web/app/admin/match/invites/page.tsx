'use client';

import { useMemo, useState } from 'react';
import {
  useAdminInvites,
  useIssueDetachedMutation,
  useIssueToProfileMutation,
  useIssueToSelfMutation,
  useRevokeInviteMutation,
} from '../_lib/queries';

export default function MatchAdminInvitesPage() {
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [usedBy, setUsedBy] = useState('');
  const [source, setSource] = useState('');
  const [selfCount, setSelfCount] = useState(10);
  const [targetProfileId, setTargetProfileId] = useState('');
  const [targetCount, setTargetCount] = useState(5);
  const [targetReason, setTargetReason] = useState('');
  const [detachedCount, setDetachedCount] = useState(50);
  const [detachedReason, setDetachedReason] = useState('');
  const [detachedResult, setDetachedResult] = useState<Array<Record<string, unknown>>>([]);

  const params = useMemo(
    () => ({ status: status || undefined, owner: owner || undefined, usedBy: usedBy || undefined, source: source || undefined }),
    [owner, source, status, usedBy],
  );
  const { data } = useAdminInvites(params);
  const issueSelf = useIssueToSelfMutation();
  const issueProfile = useIssueToProfileMutation();
  const issueDetached = useIssueDetachedMutation();
  const revokeInvite = useRevokeInviteMutation();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-semibold">A. Выпустить себе</h3>
          <input
            type="number"
            min={1}
            max={100}
            value={selfCount}
            onChange={(event) => setSelfCount(Number(event.target.value))}
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium"
            onClick={() => issueSelf.mutate(selfCount)}
          >
            Выпустить
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-semibold">B. Подарить профилю</h3>
          <input
            value={targetProfileId}
            onChange={(event) => setTargetProfileId(event.target.value)}
            placeholder="profileId"
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={100}
            value={targetCount}
            onChange={(event) => setTargetCount(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={targetReason}
            onChange={(event) => setTargetReason(event.target.value)}
            placeholder="reason"
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium"
            onClick={() =>
              issueProfile.mutate({
                profileId: targetProfileId,
                count: targetCount,
                reason: targetReason,
              })
            }
          >
            Подарить
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="font-semibold">C. Detached выпуск</h3>
          <input
            type="number"
            min={1}
            max={500}
            value={detachedCount}
            onChange={(event) => setDetachedCount(Number(event.target.value))}
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={detachedReason}
            onChange={(event) => setDetachedReason(event.target.value)}
            placeholder="reason"
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium"
            onClick={async () => {
              const result = await issueDetached.mutateAsync({
                count: detachedCount,
                reason: detachedReason,
              });
              setDetachedResult((result as Array<Record<string, unknown>>) ?? []);
            }}
          >
            Выпустить
          </button>
        </div>
      </div>

      {detachedResult.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Detached коды</h3>
            <button
              className="text-xs text-violet-300"
              onClick={() =>
                navigator.clipboard.writeText(
                  detachedResult
                    .map((item) => String(item.code ?? ''))
                    .filter(Boolean)
                    .join('\n'),
                )
              }
            >
              Скопировать все
            </button>
          </div>
          <pre className="max-h-52 overflow-auto rounded bg-zinc-950 p-2 text-xs">
            {JSON.stringify(detachedResult, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">Все статусы</option>
            <option value="available">available</option>
            <option value="used">used</option>
            <option value="revoked">revoked</option>
          </select>
          <input
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="owner"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={usedBy}
            onChange={(event) => setUsedBy(event.target.value)}
            placeholder="usedBy"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="source"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Код</th>
              <th className="px-3 py-2 text-left">Owner</th>
              <th className="px-3 py-2 text-left">UsedBy</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((raw) => {
              const item = raw as {
                id: string;
                code: string;
                source: string;
                createdAt: string;
                usedAt?: string | null;
                revokedAt?: string | null;
                owner?: { displayName?: string | null } | null;
                usedBy?: { displayName?: string | null } | null;
              };
              const statusText = item.revokedAt
                ? 'revoked'
                : item.usedAt
                  ? 'used'
                  : 'available';
              return (
                <tr key={item.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-mono">{item.code}</td>
                  <td className="px-3 py-2">{item.owner?.displayName ?? '—'}</td>
                  <td className="px-3 py-2">{item.usedBy?.displayName ?? '—'}</td>
                  <td className="px-3 py-2">{item.source}</td>
                  <td className="px-3 py-2">{statusText}</td>
                  <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">
                    {!item.usedAt && !item.revokedAt ? (
                      <button
                        className="text-xs text-red-300"
                        onClick={() =>
                          revokeInvite.mutate({
                            code: item.code,
                            reason: 'manual_admin_revoke',
                          })
                        }
                      >
                        revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
