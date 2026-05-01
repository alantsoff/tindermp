'use client';

import { useMemo, useState } from 'react';
import { useAdminAudit } from '../_lib/queries';

const INPUT_CLASS =
  'rounded-lg border border-[rgb(var(--hairline-strong))] bg-ios-inset px-3 py-2 text-sm text-ios-label placeholder:text-ios-label-tertiary focus:border-ios-purple focus:outline-none';

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
      <div className="rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={admin}
            onChange={(event) => setAdmin(event.target.value)}
            placeholder="admin userId"
            className={INPUT_CLASS}
          />
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="action"
            className={INPUT_CLASS}
          />
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="target profileId"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[rgb(var(--hairline))] bg-ios-elevated">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-ios-inset text-ios-label-secondary">
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
                <td colSpan={6} className="px-3 py-3 text-ios-label-tertiary">
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
                  <tr key={String(item.id)} className="border-t border-[rgb(var(--hairline))] align-top">
                    <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="px-3 py-2">{item.adminUser?.displayName ?? item.adminUserId}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">{item.targetProfileId ?? '—'}</td>
                    <td className="px-3 py-2">{item.reason ?? '—'}</td>
                    <td className="px-3 py-2">
                      <pre className="max-w-[320px] overflow-auto rounded bg-ios-inset p-2 text-xs text-ios-label-secondary">
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
