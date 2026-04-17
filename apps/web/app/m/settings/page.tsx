'use client';

import { FormEvent, useEffect, useState } from 'react';
import { MATCH_ROLES } from '../_components/RolePicker';
import { matchApi } from '../_lib/api';
import { useUpdateSettings } from '../_lib/queries';

export default function MatchSettingsPage() {
  const updateSettings = useUpdateSettings();
  const [roles, setRoles] = useState<string[]>([]);
  const [niches, setNiches] = useState('');
  const [hideFromFeed, setHideFromFeed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await matchApi.getSettings();
        if (!mounted) return;
        setRoles(data.interestedRoles);
        setNiches(data.interestedNiches.join(', '));
        setHideFromFeed(data.hideFromFeed);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить фильтры');
      } finally {
        if (mounted) setLoaded(true);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleRole = (value: string) => {
    setRoles((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await updateSettings.mutateAsync({
        interestedRoles: roles,
        interestedNiches: niches.split(',').map((x) => x.trim()).filter(Boolean),
        hideFromFeed,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };

  if (!loaded) {
    return <div className="py-20 text-center text-sm text-zinc-400">Загружаем фильтры…</div>;
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">Настройки поиска</h1>

      <div className="grid grid-cols-2 gap-2">
        {MATCH_ROLES.map((role) => (
          <button
            type="button"
            key={role.value}
            className={`rounded-xl border px-3 py-2 text-sm ${
              roles.includes(role.value)
                ? 'border-violet-400 bg-violet-500/20 text-white'
                : 'border-zinc-700 text-zinc-300'
            }`}
            onClick={() => toggleRole(role.value)}
          >
            {role.label}
          </button>
        ))}
      </div>

      <input
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Ниши через запятую"
        value={niches}
        onChange={(event) => setNiches(event.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={hideFromFeed}
          onChange={(event) => setHideFromFeed(event.target.checked)}
        />
        Скрыть мой профиль из чужой ленты
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold disabled:opacity-60"
        disabled={updateSettings.isPending}
      >
        {updateSettings.isPending ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  );
}
