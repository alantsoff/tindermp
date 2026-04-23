'use client';

import { useMemo, useState } from 'react';
import { useAdminAudit } from '../_lib/queries';

export default function MatchAdminAuditPage() {
  const [admin, setAdmin] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const params = useMemo(
    () => ({ admin: admin || undefined, action: action || undefined, target: target || undefined }),
    [action, admin, target],
  );
  const { data, isLoading } = useAdminAudit(params);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={admin}
            onChange={(event) => setAdmin(event.target.value)}
            placeholder="admin userId"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="action"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="target profileId"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Дата</th>
              <th className="px-3 py-2 text-left">Админ</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Target</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Payload</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-zinc-500">
                  Загрузка...
                </td>
              </tr>
            ) : (
              (data ?? []).map((row) => {
                const item = row as {
                  id: string | number;
                  createdAt: string;
                  adminUserId: string;
                  action: string;
                  targetProfileId?: string | null;
                  reason?: string | null;
                  payload?: unknown;
                  adminUser?: { displayName?: string | null };
                };
                return (
                  <tr key={String(item.id)} className="border-t border-zinc-800 align-top">
                    <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2">{item.adminUser?.displayName ?? item.adminUserId}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">{item.targetProfileId ?? '—'}</td>
                    <td className="px-3 py-2">{item.reason ?? '—'}</td>
                  <td className="px-3 py-2">
                    <pre className="max-w-[320px] overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                      {JSON.stringify(item.payload ?? null, null, 2)}
                    </pre>
                  </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
