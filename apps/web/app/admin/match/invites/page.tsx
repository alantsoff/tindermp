'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useAdminInvites,
  useIssueDetachedMutation,
  useIssueToProfileMutation,
  useIssueToSelfMutation,
  useRevokeInviteMutation,
} from '../_lib/queries';

const INPUT_CLASS =
  'w-full rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none';
const PRIMARY_BTN_CLASS =
  'w-full rounded-lg bg-ios-purple px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';

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
      <div>
        <h2 className="text-lg font-semibold">Инвайт-коды</h2>
        <p className="mt-1 text-sm text-ios-label-secondary">
          Владелец кода (owner) — кто выпустил приглашение. Used by — профиль, который активировал
          код. В ячейках — ссылка в карточку пользователя.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h3 className="font-semibold">A. Выпустить себе</h3>
          <input
            type="number"
            min={1}
            max={100}
            value={selfCount}
            onChange={(event) => setSelfCount(Number(event.target.value))}
            className={`mt-3 ${INPUT_CLASS}`}
          />
          <button
            className={`mt-2 ${PRIMARY_BTN_CLASS}`}
            onClick={() => issueSelf.mutate(selfCount)}
          >
            Выпустить
          </button>
        </div>

        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h3 className="font-semibold">B. Подарить профилю</h3>
          <input
            value={targetProfileId}
            onChange={(event) => setTargetProfileId(event.target.value)}
            placeholder="profileId"
            className={`mt-3 ${INPUT_CLASS}`}
          />
          <input
            type="number"
            min={1}
            max={100}
            value={targetCount}
            onChange={(event) => setTargetCount(Number(event.target.value))}
            className={`mt-2 ${INPUT_CLASS}`}
          />
          <input
            value={targetReason}
            onChange={(event) => setTargetReason(event.target.value)}
            placeholder="reason"
            className={`mt-2 ${INPUT_CLASS}`}
          />
          <button
            className={`mt-2 ${PRIMARY_BTN_CLASS}`}
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

        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <h3 className="font-semibold">C. Detached выпуск</h3>
          <input
            type="number"
            min={1}
            max={500}
            value={detachedCount}
            onChange={(event) => setDetachedCount(Number(event.target.value))}
            className={`mt-3 ${INPUT_CLASS}`}
          />
          <input
            value={detachedReason}
            onChange={(event) => setDetachedReason(event.target.value)}
            placeholder="reason"
            className={`mt-2 ${INPUT_CLASS}`}
          />
          <button
            className={`mt-2 ${PRIMARY_BTN_CLASS}`}
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
        <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Detached коды</h3>
            <button
              className="text-xs text-ios-purple hover:opacity-80"
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
          <pre className="max-h-52 overflow-auto rounded bg-ios-inset p-2 text-xs text-ios-label-secondary">
            {JSON.stringify(detachedResult, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
          />
          <input
            value={usedBy}
            onChange={(event) => setUsedBy(event.target.value)}
            placeholder="usedBy"
            className={INPUT_CLASS}
          />
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="source"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-ios-inset text-ios-label-secondary">
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
                owner?: { id: string; displayName?: string | null; role?: string } | null;
                usedBy?: { id: string; displayName?: string | null; role?: string } | null;
              };
              const statusText = item.revokedAt
                ? 'revoked'
                : item.usedAt
                  ? 'used'
                  : 'available';
              return (
                <tr key={item.id} className="border-t border-[rgb(var(--hairline))]">
                  <td className="px-3 py-2 font-mono">{item.code}</td>
                  <td className="px-3 py-2">
                    {item.owner?.id ? (
                      <Link
                        className="text-ios-purple hover:opacity-80"
                        href={`/admin/match/users/${encodeURIComponent(item.owner.id)}`}
                      >
                        {item.owner?.displayName ?? item.owner.id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {item.usedBy?.id ? (
                      <Link
                        className="text-ios-purple hover:opacity-80"
                        href={`/admin/match/users/${encodeURIComponent(item.usedBy.id)}`}
                      >
                        {item.usedBy?.displayName ?? item.usedBy.id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">{item.source}</td>
                  <td className="px-3 py-2">{statusText}</td>
                  <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="px-3 py-2">
                    {!item.usedAt && !item.revokedAt ? (
                      <button
                        className="text-xs text-ios-red hover:opacity-80"
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
