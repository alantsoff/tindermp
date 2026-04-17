'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MATCH_ROLES, RolePicker } from '../_components/RolePicker';
import { matchApi } from '../_lib/api';

const PURPOSE_PRESETS = [
  'Ищу команду под запуск/масштабирование',
  'Ищу клиентов и проекты',
  'Ищу работу в сильной команде',
  'Ищу подрядчиков для магазина',
  'Хочу нетворкинг в нише',
] as const;

export default function MatchOnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState('SELLER');
  const [roleCustom, setRoleCustom] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [purposePreset, setPurposePreset] = useState('');
  const [purposeText, setPurposeText] = useState('');
  const [niches, setNiches] = useState('');
  const [skills, setSkills] = useState('');
  const [interestedRoles, setInterestedRoles] = useState<string[]>([]);
  const [interestedNiches, setInterestedNiches] = useState('');
  const [telegramContact, setTelegramContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) {
      setError('Имя должно быть минимум 2 символа');
      return;
    }
    if (role === 'CUSTOM' && roleCustom.trim().length < 2) {
      setError('Укажите custom-роль');
      return;
    }

    const purposeParts = [purposePreset.trim(), purposeText.trim()].filter(Boolean);
    const headline = purposeParts.join(' — ').slice(0, 120);

    setSaving(true);
    try {
      await matchApi.upsertProfile({
        role,
        roleCustom: role === 'CUSTOM' ? roleCustom : undefined,
        displayName,
        headline,
        niches: niches.split(',').map((x) => x.trim()).filter(Boolean),
        skills: skills.split(',').map((x) => x.trim()).filter(Boolean),
        interestedRoles,
        interestedNiches: interestedNiches.split(',').map((x) => x.trim()).filter(Boolean),
        telegramContact: telegramContact.trim() || undefined,
      });
      router.replace('/m/feed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4 pb-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">Создай профиль</h1>

      <RolePicker value={role} onChange={setRole} />
      {role === 'CUSTOM' ? (
        <input
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Твоя роль"
          value={roleCustom}
          onChange={(event) => setRoleCustom(event.target.value)}
        />
      ) : null}

      <input
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Имя"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />

      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="text-sm font-semibold text-zinc-200">Зачем я тут</h2>
        <div className="flex flex-wrap gap-2">
          {PURPOSE_PRESETS.map((preset) => {
            const active = purposePreset === preset;
            return (
              <button
                key={preset}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${
                  active
                    ? 'border-violet-400 bg-violet-500/20 text-white'
                    : 'border-zinc-700 text-zinc-300'
                }`}
                onClick={() => setPurposePreset((prev) => (prev === preset ? '' : preset))}
              >
                {preset}
              </button>
            );
          })}
        </div>
        <textarea
          className="min-h-20 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Коротко: какую задачу хочешь закрыть через Match"
          value={purposeText}
          onChange={(event) => setPurposeText(event.target.value)}
        />
      </div>

      <input
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Ниши через запятую"
        value={niches}
        onChange={(event) => setNiches(event.target.value)}
      />
      <input
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Навыки через запятую"
        value={skills}
        onChange={(event) => setSkills(event.target.value)}
      />

      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="text-sm font-semibold text-zinc-200">Кого ищу</h2>
        <p className="text-xs text-zinc-500">Если ничего не выбрать — показываем всех.</p>
        <div className="grid grid-cols-2 gap-2">
          {MATCH_ROLES.map((targetRole) => {
            const active = interestedRoles.includes(targetRole.value);
            return (
              <button
                type="button"
                key={targetRole.value}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  active
                    ? 'border-violet-400 bg-violet-500/20 text-white'
                    : 'border-zinc-700 text-zinc-300'
                }`}
                onClick={() =>
                  setInterestedRoles((prev) =>
                    prev.includes(targetRole.value)
                      ? prev.filter((value) => value !== targetRole.value)
                      : [...prev, targetRole.value],
                  )
                }
              >
                {targetRole.label}
              </button>
            );
          })}
        </div>
        <input
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Ниши, которые интересны (через запятую)"
          value={interestedNiches}
          onChange={(event) => setInterestedNiches(event.target.value)}
        />
      </div>

      <input
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Telegram контакт, например @username"
        value={telegramContact}
        onChange={(event) => setTelegramContact(event.target.value)}
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold disabled:opacity-60"
        disabled={saving}
      >
        {saving ? 'Сохраняем...' : 'Продолжить'}
      </button>
    </form>
  );
}
