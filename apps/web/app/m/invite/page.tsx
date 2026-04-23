import { Suspense } from 'react';
import { MatchInviteClient } from '../_components/MatchInviteClient';

export default function MatchInvitePage() {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-zinc-500">Загрузка...</div>}>
      <MatchInviteClient />
    </Suspense>
  );
}
