'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  EyeOff,
  Home,
  Image as ImageIcon,
  ImageOff,
  RotateCcw,
  Users,
} from 'lucide-react';
import { Chip } from '../_components/Chip';
import { MATCH_ROLES } from '../_components/RolePicker';
import { matchApi, type MatchProfile } from '../_lib/api';
import {
  MARKETPLACE_LABELS,
  MatchMarketplaceValue,
  MatchWorkFormatValue,
} from '../_lib/labels';
import { hapticImpact } from '../_lib/telegram';
import {
  usePauseMutation,
  useSwipeResetMutation,
  useSwipeResetPreview,
  useUpdateSettings,
} from '../_lib/queries';

type SettingsDraft = {
  roles: string[];
  niches: string;
  hideFromFeed: boolean;
  interestedWorkFormats: MatchWorkFormatValue[];
  sameCityOnly: boolean;
  interestedMarketplaces: MatchMarketplaceValue[];
  experienceBand: ExperienceBandId;
  photoPreference: 'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO';
  notifyMatch: boolean;
  notifyIncomingLike: boolean;
  notifyMessage: boolean;
  notifyInvite: boolean;
  notifyDigest: boolean;
};

type ExperienceBandId = 'ANY' | 'JUNIOR' | 'MIDDLE' | 'SENIOR' | 'EXPERT';

const EXPERIENCE_BANDS: Array<{
  id: ExperienceBandId;
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { id: 'ANY', label: 'Любой', min: null, max: null },
  { id: 'JUNIOR', label: '0-1 год', min: 0, max: 1 },
  { id: 'MIDDLE', label: '2-4 года', min: 2, max: 4 },
  { id: 'SENIOR', label: '5-8 лет', min: 5, max: 8 },
  { id: 'EXPERT', label: '9-15 лет', min: 9, max: 15 },
];

function experienceBandFromRange(
  min: number | null | undefined,
  max: number | null | undefined,
): ExperienceBandId {
  const normalizedMin = min ?? null;
  const normalizedMax = max ?? null;
  return (
    EXPERIENCE_BANDS.find(
      (band) => band.min === normalizedMin && band.max === normalizedMax,
    )?.id ?? 'ANY'
  );
}

function normalizeDraft(draft: SettingsDraft): SettingsDraft {
  return {
    ...draft,
    roles: [...draft.roles].sort(),
    interestedWorkFormats: [...draft.interestedWorkFormats].sort(),
    interestedMarketplaces: [...draft.interestedMarketplaces].sort(),
    niches: draft.niches
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .join(', '),
  };
}

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => {
        hapticImpact('light');
        onChange(!checked);
      }}
      className="relative shrink-0 cursor-pointer rounded-full transition-colors duration-200"
      style={{
        width: 51,
        height: 31,
        padding: 0,
        flex: '0 0 51px',
        background: checked
          ? 'rgb(var(--ios-green))'
          : 'rgb(var(--ios-gray-3))',
      }}
    >
      <span
        aria-hidden
        className="block rounded-full bg-white transition-transform duration-200 ease-out"
        style={{
          width: 27,
          height: 27,
          position: 'absolute',
          top: 2,
          left: 2,
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          boxShadow:
            '0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.16)',
        }}
      />
    </button>
  );
}

function Section({
  title,
  trailing,
  children,
  description,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <section>
      <div className="ios-section-header mb-1 flex items-center justify-between gap-2 pr-4">
        <span>{title}</span>
        {trailing}
      </div>
      <div className="glass glass-edge rounded-2xl p-2.5">{children}</div>
      {description ? (
        <p className="mt-1 px-3 text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
          {description}
        </p>
      ) : null}
    </section>
  );
}

function SmallTextButton({
  children,
  onClick,
  color = 'tint',
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: 'tint' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-semibold"
      style={{
        color:
          color === 'tint'
            ? 'rgb(var(--ios-tint))'
            : 'rgb(var(--ios-label-secondary)/0.8)',
      }}
    >
      {children}
    </button>
  );
}

export default function MatchSettingsPage() {
  const qc = useQueryClient();
  const updateSettings = useUpdateSettings();
  const pauseMutation = usePauseMutation();
  const resetPreviewQuery = useSwipeResetPreview();
  const resetSwipeMutation = useSwipeResetMutation();
  const [profile, setProfile] = useState<MatchProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [niches, setNiches] = useState('');
  const [hideFromFeed, setHideFromFeed] = useState(false);
  const [interestedWorkFormats, setInterestedWorkFormats] = useState<
    MatchWorkFormatValue[]
  >([]);
  const [sameCityOnly, setSameCityOnly] = useState(false);
  const [interestedMarketplaces, setInterestedMarketplaces] = useState<
    MatchMarketplaceValue[]
  >([]);
  const [experienceBand, setExperienceBand] = useState<ExperienceBandId>('ANY');
  const [photoPreference, setPhotoPreference] = useState<
    'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO'
  >('ANY');
  const [notifyMatch, setNotifyMatch] = useState(true);
  const [notifyIncomingLike, setNotifyIncomingLike] = useState(true);
  const [notifyMessage, setNotifyMessage] = useState(true);
  const [notifyInvite, setNotifyInvite] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pauseDays, setPauseDays] = useState('7');
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [settingsData, meData] = await Promise.all([
          matchApi.getSettings(),
          matchApi.me(),
        ]);
        if (!mounted) return;
        setRoles(settingsData.interestedRoles);
        setInterestedWorkFormats(
          (settingsData.interestedWorkFormats ?? []) as MatchWorkFormatValue[],
        );
        setSameCityOnly(settingsData.sameCityOnly ?? false);
        setInterestedMarketplaces(
          (settingsData.interestedMarketplaces ?? []) as MatchMarketplaceValue[],
        );
        setExperienceBand(
          experienceBandFromRange(settingsData.experienceMin, settingsData.experienceMax),
        );
        setPhotoPreference(settingsData.photoPreference ?? 'ANY');
        setNiches(settingsData.interestedNiches.join(', '));
        setHideFromFeed(settingsData.hideFromFeed);
        setNotifyMatch(settingsData.notifyMatch ?? true);
        setNotifyIncomingLike(settingsData.notifyIncomingLike ?? true);
        setNotifyMessage(settingsData.notifyMessage ?? true);
        setNotifyInvite(settingsData.notifyInvite ?? true);
        setNotifyDigest(settingsData.notifyDigest ?? true);
        const nextProfile = meData.profile;
        setProfile(nextProfile);
        const snapshot = normalizeDraft({
          roles: settingsData.interestedRoles,
          interestedWorkFormats: (settingsData.interestedWorkFormats ??
            []) as MatchWorkFormatValue[],
          sameCityOnly: settingsData.sameCityOnly ?? false,
          interestedMarketplaces: (settingsData.interestedMarketplaces ??
            []) as MatchMarketplaceValue[],
          experienceBand: experienceBandFromRange(
            settingsData.experienceMin,
            settingsData.experienceMax,
          ),
          photoPreference: settingsData.photoPreference ?? 'ANY',
          niches: settingsData.interestedNiches.join(', '),
          hideFromFeed: settingsData.hideFromFeed,
          notifyMatch: settingsData.notifyMatch ?? true,
          notifyIncomingLike: settingsData.notifyIncomingLike ?? true,
          notifyMessage: settingsData.notifyMessage ?? true,
          notifyInvite: settingsData.notifyInvite ?? true,
          notifyDigest: settingsData.notifyDigest ?? true,
        });
        setSavedSnapshot(JSON.stringify(snapshot));
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
    setRoles((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  };
  const selectAllRoles = () => setRoles(MATCH_ROLES.map((role) => role.value));
  const clearAllRoles = () => setRoles([]);
  const selectAllMarketplaces = () =>
    setInterestedMarketplaces(
      (Object.keys(MARKETPLACE_LABELS) as MatchMarketplaceValue[]).filter(
        (value) => value !== 'OTHER',
      ),
    );
  const clearAllMarketplaces = () => setInterestedMarketplaces([]);

  const photoWithSelected = photoPreference !== 'WITHOUT_PHOTO';
  const photoWithoutSelected = photoPreference !== 'WITH_PHOTO';

  const togglePhotoWith = () => {
    setPhotoPreference((prev) => (prev === 'WITH_PHOTO' ? 'ANY' : 'WITH_PHOTO'));
  };

  const togglePhotoWithout = () => {
    setPhotoPreference((prev) => (prev === 'WITHOUT_PHOTO' ? 'ANY' : 'WITHOUT_PHOTO'));
  };

  const currentSnapshot = JSON.stringify(
    normalizeDraft({
      roles,
      niches,
      hideFromFeed,
      interestedWorkFormats,
      sameCityOnly,
      interestedMarketplaces,
      experienceBand,
      photoPreference,
      notifyMatch,
      notifyIncomingLike,
      notifyMessage,
      notifyInvite,
      notifyDigest,
    }),
  );
  const isDirty = loaded && savedSnapshot !== currentSnapshot;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const selectedExperienceBand =
      EXPERIENCE_BANDS.find((band) => band.id === experienceBand) ?? EXPERIENCE_BANDS[0];
    try {
      await updateSettings.mutateAsync({
        interestedRoles: roles,
        interestedWorkFormats,
        sameCityOnly,
        interestedMarketplaces,
        interestedNiches: niches.split(',').map((x) => x.trim()).filter(Boolean),
        experienceMin: selectedExperienceBand.min,
        experienceMax: selectedExperienceBand.max,
        photoPreference,
        hideFromFeed,
        notifyMatch,
        notifyIncomingLike,
        notifyMessage,
        notifyInvite,
        notifyDigest,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['match', 'me'] }),
        qc.invalidateQueries({ queryKey: ['match', 'feed'] }),
      ]);
      setSavedSnapshot(currentSnapshot);
      setSuccess('Фильтры применены');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };

  const setPause = async (days?: number) => {
    setError(null);
    try {
      await pauseMutation.mutateAsync(days);
      const meData = await matchApi.me();
      setProfile(meData.profile);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['match', 'me'] }),
        qc.invalidateQueries({ queryKey: ['match', 'feed'] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить паузу');
    }
  };

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="ios-spinner" aria-label="Загрузка" />
      </div>
    );
  }

  return (
    <form className="space-y-3 pb-44" onSubmit={onSubmit}>
      <Section
        title={`Роли · ${roles.length} из ${MATCH_ROLES.length}`}
        trailing={
          <span className="flex items-center gap-2">
            <SmallTextButton onClick={selectAllRoles}>Выбрать все</SmallTextButton>
            <span className="text-[rgb(var(--ios-label-quaternary)/0.5)]">·</span>
            <SmallTextButton color="secondary" onClick={clearAllRoles}>
              Снять
            </SmallTextButton>
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {MATCH_ROLES.map((role) => (
            <Chip
              key={role.value}
              label={role.label}
              selected={roles.includes(role.value)}
              onToggle={() => toggleRole(role.value)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Формат работы партнёра"
        description={
          interestedWorkFormats.length
            ? 'Выбраны конкретные форматы'
            : 'Показываем все форматы'
        }
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['REMOTE', 'Удалённо', Home],
              ['OFFICE', 'В офисе', Building2],
              ['HYBRID', 'Гибрид', Users],
            ] as const
          ).map(([value, label, Icon]) => (
            <Chip
              key={value}
              label={label}
              selected={interestedWorkFormats.includes(value)}
              leadingIcon={<Icon size={14} strokeWidth={2.2} />}
              onToggle={() =>
                setInterestedWorkFormats((prev) =>
                  prev.includes(value)
                    ? prev.filter((x) => x !== value)
                    : [...prev, value],
                )
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="Опыт партнёра"
        description={`Выбрано: ${
          EXPERIENCE_BANDS.find((band) => band.id === experienceBand)?.label ?? 'Любой'
        }`}
      >
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE_BANDS.map((band) => (
            <Chip
              key={band.id}
              label={band.label}
              selected={experienceBand === band.id}
              onToggle={() => setExperienceBand(band.id)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Фото в профиле"
        description={
          photoPreference === 'WITH_PHOTO'
            ? 'Только с фото'
            : photoPreference === 'WITHOUT_PHOTO'
              ? 'Только без фото'
              : 'С фото и без фото'
        }
      >
        <div className="flex flex-wrap gap-2">
          <Chip
            label="С фото"
            selected={photoWithSelected}
            leadingIcon={<ImageIcon size={14} strokeWidth={2.2} />}
            onToggle={togglePhotoWith}
          />
          <Chip
            label="Без фото"
            selected={photoWithoutSelected}
            leadingIcon={<ImageOff size={14} strokeWidth={2.2} />}
            onToggle={togglePhotoWithout}
          />
        </div>
      </Section>

      {/* Reset feed */}
      <section>
        <div className="ios-section-header mb-1 flex items-center gap-2">
          <RotateCcw size={14} /> Обновление ленты
        </div>
        <div className="glass glass-edge space-y-2.5 rounded-2xl p-3">
          <p className="text-[13.5px] leading-snug text-[rgb(var(--ios-label-secondary)/0.9)]">
            Вернуть в ленту всех, кого вы дизлайкнули. Совпавшие матчи и лайки
            останутся.
          </p>
          <button
            type="button"
            onClick={() => {
              void resetSwipeMutation
                .mutateAsync()
                .then((result) =>
                  setSuccess(
                    `Лента обновлена: вернули ${result.deletedCount} карточек.`,
                  ),
                )
                .catch((e: unknown) => {
                  setError(
                    e instanceof Error ? e.message : 'Не удалось обновить ленту',
                  );
                });
            }}
            disabled={
              resetPreviewQuery.isLoading ||
              resetSwipeMutation.isPending ||
              (resetPreviewQuery.data?.resettableCount ?? 0) === 0
            }
            className="ios-btn-primary w-full disabled:cursor-not-allowed"
          >
            {resetPreviewQuery.isLoading
              ? 'Проверяем…'
              : (resetPreviewQuery.data?.resettableCount ?? 0) === 0
                ? 'Нечего сбрасывать'
                : `Показать заново дизлайкнутых (${resetPreviewQuery.data?.resettableCount ?? 0})`}
          </button>
        </div>
      </section>

      {/* География */}
      <section>
        <div className="ios-section-header mb-1">География</div>
        <div className="ios-group">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-[15px]">Только мой город</div>
              <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
                Для МСК/СПБ показываются оба города.
              </div>
            </div>
            <Toggle
              checked={sameCityOnly}
              onChange={setSameCityOnly}
              ariaLabel="Только мой город"
            />
          </div>
        </div>
      </section>

      <Section
        title={`Маркетплейсы · ${interestedMarketplaces.length} из ${
          (Object.keys(MARKETPLACE_LABELS) as MatchMarketplaceValue[]).filter(
            (value) => value !== 'OTHER',
          ).length
        }`}
        trailing={
          <span className="flex items-center gap-2">
            <SmallTextButton onClick={selectAllMarketplaces}>
              Выбрать все
            </SmallTextButton>
            <span className="text-[rgb(var(--ios-label-quaternary)/0.5)]">·</span>
            <SmallTextButton color="secondary" onClick={clearAllMarketplaces}>
              Снять
            </SmallTextButton>
          </span>
        }
        description={
          interestedMarketplaces.length
            ? 'Фильтруем по выбранным'
            : 'Любые маркетплейсы'
        }
      >
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MARKETPLACE_LABELS) as MatchMarketplaceValue[])
            .filter((value) => value !== 'OTHER')
            .map((value) => (
              <Chip
                key={value}
                label={MARKETPLACE_LABELS[value]}
                selected={interestedMarketplaces.includes(value)}
                onToggle={() =>
                  setInterestedMarketplaces((prev) =>
                    prev.includes(value)
                      ? prev.filter((x) => x !== value)
                      : [...prev, value],
                  )
                }
              />
            ))}
        </div>
      </Section>

      <Section title="Ниши">
        <input
          className="ios-input"
          placeholder="Ниши через запятую"
          value={niches}
          onChange={(event) => setNiches(event.target.value)}
        />
      </Section>

      {/* Скрыть профиль */}
      <section>
        <div className="ios-section-header mb-1 flex items-center gap-2">
          <EyeOff size={14} /> Видимость
        </div>
        <div className="ios-group">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-[15px]">Скрыть профиль из ленты</div>
              <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
                Матчи и чаты останутся. Включайте, если собрали команду.
              </div>
            </div>
            <Toggle
              checked={hideFromFeed}
              onChange={setHideFromFeed}
              ariaLabel="Скрыть профиль"
            />
          </div>
        </div>
      </section>

      {/* Уведомления */}
      <section>
        <div className="ios-section-header mb-1 flex items-center gap-2">
          <Bell size={14} /> Уведомления в Telegram
        </div>
        <div className="ios-group">
          {(
            [
              ['notifyMatch', 'Новый мэтч', notifyMatch, setNotifyMatch],
              [
                'notifyMessage',
                'Сообщения в чате',
                notifyMessage,
                setNotifyMessage,
              ],
              [
                'notifyIncomingLike',
                'Вас лайкнули',
                notifyIncomingLike,
                setNotifyIncomingLike,
              ],
              [
                'notifyInvite',
                'Активация инвайта',
                notifyInvite,
                setNotifyInvite,
              ],
              [
                'notifyDigest',
                'Ежедневный дайджест',
                notifyDigest,
                setNotifyDigest,
              ],
            ] as const
          ).map(([key, label, value, setter]) => (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="text-[15px]">{label}</div>
              <Toggle
                checked={value}
                onChange={setter}
                ariaLabel={label}
              />
            </div>
          ))}
        </div>
        <p className="mt-1 px-3 text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
          Push приходит от бота Match в Telegram. Сообщения в чате
          группируются — не больше одного push в 30 минут на пару.
        </p>
      </section>

      {/* Пауза профиля */}
      <section>
        <div className="ios-section-header mb-1">Пауза профиля</div>
        <div className="glass glass-edge space-y-2.5 rounded-2xl p-3">
          <p className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
            Пока пауза активна, ваш профиль не показывается в лентах.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className="ios-btn-plain text-[13px]"
              onClick={() => void setPause(7)}
            >
              1 неделя
            </button>
            <button
              type="button"
              className="ios-btn-plain text-[13px]"
              onClick={() => void setPause(30)}
            >
              1 месяц
            </button>
            <button
              type="button"
              className="ios-btn-plain text-[13px]"
              onClick={() => void setPause()}
            >
              Снять
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className="ios-input flex-1"
              value={pauseDays}
              onChange={(event) => setPauseDays(event.target.value)}
              placeholder="дней"
              inputMode="numeric"
            />
            <button
              type="button"
              className="ios-btn-tinted shrink-0"
              onClick={() => {
                const parsed = Number.parseInt(pauseDays, 10);
                if (Number.isFinite(parsed)) void setPause(parsed);
              }}
            >
              Поставить
            </button>
          </div>
          <p className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
            Текущая пауза:{' '}
            {profile?.pausedUntil
              ? new Date(profile.pausedUntil).toLocaleString('ru-RU')
              : 'не активна'}
          </p>
        </div>
      </section>

      {error ? (
        <p
          className="glass-ultra-thin rounded-2xl border px-4 py-2.5 text-[14px]"
          style={{
            color: 'rgb(var(--ios-red))',
            borderColor: 'rgb(var(--ios-red) / 0.3)',
          }}
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="glass-ultra-thin rounded-2xl border px-4 py-2.5 text-[14px]"
          style={{
            color: 'rgb(var(--ios-green))',
            borderColor: 'rgb(var(--ios-green) / 0.3)',
          }}
        >
          {success}
        </p>
      ) : null}

      <div
        className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
        style={{
          bottom:
            'calc(max(env(safe-area-inset-bottom), var(--tg-safe-area-inset-bottom, 0px)) + 96px)',
        }}
      >
        <button
          type="submit"
          className="ios-btn-primary pointer-events-auto w-full max-w-[400px] shadow-[0_18px_40px_-12px_rgb(var(--ios-tint)/0.55)] disabled:cursor-not-allowed"
          disabled={!isDirty || updateSettings.isPending}
        >
          {updateSettings.isPending ? 'Сохраняю…' : 'Сохранить изменения'}
        </button>
      </div>
    </form>
  );
}
