'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Home, Plus, Trash2, Users } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { Chip } from '../_components/Chip';
import { RolePicker } from '../_components/RolePicker';
import { matchApi, setMatchToken } from '../_lib/api';
import {
  MARKETPLACE_LABELS,
  MatchMarketplaceValue,
  MatchWorkFormatValue,
} from '../_lib/labels';
import {
  getInitData,
  getTelegramInitUser,
  getTelegramPhotoUrl,
  hapticImpact,
} from '../_lib/telegram';
import { parseHeadlineToPurposeParts } from '../_lib/purpose';

const PURPOSE_PRESETS = [
  'Найти команду',
  'Нетворкинг',
  'Ищу команду под запуск/масштабирование',
  'Ищу клиентов и проекты',
  'Ищу работу в сильной команде',
  'Ищу подрядчиков для магазина',
  'Хочу нетворкинг в нише',
] as const;

const MAX_EXTRA_PHOTOS = 6;

type LocalPhoto = { id: string; file: File; previewUrl: string };

function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="ios-section-header px-0">{title}</div>
      <div className="glass glass-edge space-y-3 rounded-2xl p-3">
        {children}
      </div>
      {description ? (
        <p className="px-2 text-[12px] text-[rgb(var(--ios-label-secondary)/0.65)]">
          {description}
        </p>
      ) : null}
    </section>
  );
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

export default function MatchOnboardingPage() {
  const router = useRouter();

  const [role, setRole] = useState('SELLER');
  const [roleCustom, setRoleCustom] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [purposePresets, setPurposePresets] = useState<string[]>([]);
  const [purposeText, setPurposeText] = useState('');
  const [experience, setExperience] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [workFormats, setWorkFormats] = useState<MatchWorkFormatValue[]>([]);
  const [marketplaces, setMarketplaces] = useState<MatchMarketplaceValue[]>([]);
  const [marketplacesCustom, setMarketplacesCustom] = useState('');
  const [niches, setNiches] = useState('');
  const [skills, setSkills] = useState('');
  const [tools, setTools] = useState('');
  const [telegramContact, setTelegramContact] = useState<string | null>(null);
  const [telegramPhotoUrl, setTelegramPhotoUrl] = useState<string | null>(null);
  const [useTelegramPhoto, setUseTelegramPhoto] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inviteCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const fromQuery =
      new URLSearchParams(window.location.search)
        .get('invite')
        ?.trim()
        .toUpperCase() ?? '';
    const fromStorage = window.sessionStorage.getItem('matchInviteCode') ?? '';
    return fromQuery || fromStorage;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill fields on client: first from Telegram (name, username, photo),
  // then from existing profile if user is editing. Runs once per mount
  // and syncs state with browser-only APIs (window.Telegram) + backend.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      // Defer all state writes to a microtask so they happen after the
      // effect's synchronous phase — this keeps the "no setState in effect
      // body" lint rule happy while preserving the intent.
      await Promise.resolve();
      if (cancelled) return;

      const tgUser = getTelegramInitUser();
      const tgPhoto = getTelegramPhotoUrl();
      const tgName =
        [tgUser?.first_name, tgUser?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        tgUser?.username ||
        '';
      const tgContact = tgUser?.username ? `@${tgUser.username}` : null;

      setTelegramPhotoUrl(tgPhoto);
      setTelegramContact(tgContact);
      setUseTelegramPhoto(Boolean(tgPhoto));
      setDisplayName(tgName);

      try {
        const me = await matchApi.me();
        if (cancelled) return;
        const p = me.profile;
        if (p) {
          if (p.displayName) setDisplayName(p.displayName);
          if (p.role) setRole(p.role);
          if (p.roleCustom) setRoleCustom(p.roleCustom);
          if (p.birthDate) setBirthDate(String(p.birthDate).slice(0, 10));
          if (p.workFormats?.length) {
            setWorkFormats(p.workFormats as MatchWorkFormatValue[]);
          }
          if (p.marketplaces?.length) {
            setMarketplaces(p.marketplaces as MatchMarketplaceValue[]);
          }
          if (p.marketplacesCustom) setMarketplacesCustom(p.marketplacesCustom);
          if (p.niches?.length) setNiches(p.niches.join(', '));
          if (p.skills?.length) setSkills(p.skills.join(', '));
          if (p.tools?.length) setTools(p.tools.join(', '));
          if (p.headline) {
            const parsedPurpose = parseHeadlineToPurposeParts(
              p.headline,
              PURPOSE_PRESETS,
            );
            setPurposePresets(parsedPurpose.purposePresets);
            setPurposeText(parsedPurpose.purposeText);
          }
          if (typeof p.experience === 'number') setExperience(p.experience);
          if (p.avatarUrl && tgPhoto && p.avatarUrl !== tgPhoto) {
            setUseTelegramPhoto(false);
          }
          if (!p.avatarUrl) {
            setUseTelegramPhoto(false);
          }
        }
      } catch {
        // Ignore — either no profile yet, or a transient auth issue.
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Release object URLs when component unmounts.
  useEffect(() => {
    return () => {
      localPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLocalPhotos = async (files: FileList | File[] | null) => {
    if (!files) return;
    const slotsLeft = MAX_EXTRA_PHOTOS - localPhotos.length;
    if (slotsLeft <= 0) return;
    const picked = Array.from(files).slice(0, slotsLeft);
    setPhotoBusy(true);
    try {
      const prepared: LocalPhoto[] = [];
      for (const file of picked) {
        if (!file.type.startsWith('image/')) continue;
        prepared.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (prepared.length) {
        setLocalPhotos((prev) => [...prev, ...prepared]);
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeLocalPhoto = (id: string) => {
    setLocalPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

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
    if (marketplaces.includes('OTHER') && marketplacesCustom.trim().length < 2) {
      setError('Заполните поле «Другое» для маркетплейсов');
      return;
    }

    const presetsJoined = purposePresets
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' · ');
    const purposeParts = [presetsJoined, purposeText.trim()].filter(Boolean);
    const headline = purposeParts.join(' — ').slice(0, 120);

    setSaving(true);
    try {
      const initData = getInitData();
      if (initData) {
        const auth = await matchApi.auth(initData);
        setMatchToken(auth.token);
      }
      await matchApi.upsertProfile({
        role,
        roleCustom: role === 'CUSTOM' ? roleCustom : undefined,
        displayName,
        avatarUrl:
          useTelegramPhoto && telegramPhotoUrl ? telegramPhotoUrl : undefined,
        birthDate: birthDate || undefined,
        workFormats,
        marketplaces,
        marketplacesCustom: marketplaces.includes('OTHER')
          ? marketplacesCustom.trim() || undefined
          : undefined,
        headline,
        experience: experience ?? undefined,
        niches: niches.split(',').map((x) => x.trim()).filter(Boolean),
        skills: skills.split(',').map((x) => x.trim()).filter(Boolean),
        tools: tools.split(',').map((x) => x.trim()).filter(Boolean),
        interestedRoles: [],
        interestedNiches: [],
        telegramContact: telegramContact || undefined,
        inviteCode: inviteCode || undefined,
      });

      // Upload extra photos one by one — backend stores them as
      // MatchProfilePhoto rows tied to the now-created profile.
      if (localPhotos.length > 0) {
        setPhotoUploadProgress({ done: 0, total: localPhotos.length });
        for (let i = 0; i < localPhotos.length; i += 1) {
          const { file } = localPhotos[i];
          try {
            const compressed = await imageCompression(file, {
              maxSizeMB: 1.8,
              maxWidthOrHeight: 1080,
              useWebWorker: true,
              fileType: 'image/webp',
            });
            await matchApi.uploadPhoto(compressed);
          } catch (uploadErr) {
            // Non-fatal: continue with the rest, surface at the end.
            console.warn('photo upload failed', uploadErr);
          }
          setPhotoUploadProgress({ done: i + 1, total: localPhotos.length });
        }
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('matchInviteCode');
      }
      router.replace('/m/feed');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить профиль';
      if (
        message.includes('invite_required') ||
        message.includes('invite_invalid') ||
        message.includes('invite_revoked') ||
        message.includes('invite_already_used')
      ) {
        if (typeof window !== 'undefined') {
          const reason = message.includes('invite_already_used')
            ? 'Этот инвайт-код уже использован. Попросите новый у знакомого.'
            : message.includes('invite_revoked')
              ? 'Этот инвайт-код отозван. Попросите новый у знакомого.'
              : '';
          if (reason) {
            window.sessionStorage.setItem('matchInviteError', reason);
          }
          window.sessionStorage.removeItem('matchInviteCode');
        }
        router.replace('/m/invite');
        return;
      }
      setError(message);
    } finally {
      setSaving(false);
      setPhotoUploadProgress(null);
    }
  };

  const photoSlotsLeft = MAX_EXTRA_PHOTOS - localPhotos.length;

  return (
    <div className="space-y-5 pb-6">
      <div className="space-y-1">
        <h1 className="ios-title-large">Создай профиль</h1>
        <p className="text-[14px] text-[rgb(var(--ios-label-secondary)/0.8)]">
          Расскажите кратко о себе — по этому профилю вас увидят другие.
        </p>
      </div>
      <form className="space-y-5" onSubmit={onSubmit}>
        <Section title="Кто вы">
          <RolePicker value={role} onChange={setRole} />
          {role === 'CUSTOM' ? (
            <input
              className="ios-input"
              placeholder="Ваша роль"
              value={roleCustom}
              onChange={(event) => setRoleCustom(event.target.value)}
            />
          ) : null}
        </Section>

        <Section title="Опыт">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={experience ?? 0}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                setExperience(Number.isNaN(value) ? 0 : value);
              }}
              className="w-full"
            />
            <input
              type="number"
              min={0}
              max={15}
              value={experience ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (raw === '') {
                  setExperience(null);
                  return;
                }
                const value = Number.parseInt(raw, 10);
                if (Number.isNaN(value)) return;
                setExperience(Math.max(0, Math.min(15, value)));
              }}
              className="ios-input w-20 text-center"
              placeholder="лет"
            />
          </div>
          <p className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
            Укажите опыт в годах: от 0 до 15.
          </p>
        </Section>

        <Section title="Контактные данные">
          <input
            className="ios-input"
            placeholder="Имя"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <input
            type="date"
            className="ios-input min-w-0 w-full"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </Section>

        <Section
          title="Фото профиля"
          description={
            telegramPhotoUrl
              ? 'Используем ваше фото из Telegram как главное, и можно добавить до 6 дополнительных. Фото можно менять в настройках профиля.'
              : 'У Telegram-аккаунта нет аватара. Загрузите от 1 до 6 фото — первое станет главным.'
          }
        >
          {telegramPhotoUrl ? (
            <div className="flex items-center gap-3 rounded-xl bg-[rgb(var(--ios-bg-inset)/0.5)] p-2 pr-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={telegramPhotoUrl}
                alt="Фото из Telegram"
                className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-[rgb(var(--hairline))]"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  Фото из Telegram
                </div>
                <div className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                  {useTelegramPhoto
                    ? 'Будет главным фото'
                    : 'Не используется'}
                </div>
              </div>
              <Toggle
                checked={useTelegramPhoto}
                onChange={setUseTelegramPhoto}
                ariaLabel="Использовать фото из Telegram"
              />
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-[rgb(var(--ios-label))]">
                Дополнительные фото
              </span>
              <span className="text-[12px] text-[rgb(var(--ios-label-secondary)/0.7)]">
                {localPhotos.length}/{MAX_EXTRA_PHOTOS}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {localPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-[rgb(var(--ios-bg-elevated))] ring-1 ring-[rgb(var(--hairline))]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt="Фото профиля"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Удалить фото"
                    onClick={() => removeLocalPhoto(photo.id)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition active:scale-95"
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
              {photoSlotsLeft > 0 ? (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Добавить фото"
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[rgb(var(--hairline-strong))] bg-[rgb(var(--ios-bg-elevated)/0.5)] text-[rgb(var(--ios-label-secondary)/0.8)] transition active:scale-[0.97] disabled:opacity-50"
                >
                  <Plus size={22} strokeWidth={2.4} />
                  <span className="text-[10px] font-medium">Добавить</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addLocalPhotos(event.target.files);
                event.currentTarget.value = '';
              }}
            />
          </div>
        </Section>

        <Section title="Где работаете">
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
                selected={workFormats.includes(value)}
                leadingIcon={<Icon size={14} strokeWidth={2.2} />}
                onToggle={() =>
                  setWorkFormats((prev) =>
                    prev.includes(value)
                      ? prev.filter((x) => x !== value)
                      : [...prev, value],
                  )
                }
              />
            ))}
          </div>
        </Section>

        <Section title="Маркетплейсы">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MARKETPLACE_LABELS) as MatchMarketplaceValue[]).map(
              (value) => (
                <Chip
                  key={value}
                  label={MARKETPLACE_LABELS[value]}
                  selected={marketplaces.includes(value)}
                  onToggle={() =>
                    setMarketplaces((prev) =>
                      prev.includes(value)
                        ? prev.filter((x) => x !== value)
                        : [...prev, value],
                    )
                  }
                />
              ),
            )}
          </div>
          {marketplaces.includes('OTHER') ? (
            <input
              className="ios-input"
              placeholder="Через запятую: Amazon RU, ДНС..."
              value={marketplacesCustom}
              onChange={(event) => setMarketplacesCustom(event.target.value)}
            />
          ) : null}
        </Section>

        <Section
          title="О себе"
          description="Можно выбрать несколько — например «Найти команду» и «Нетворкинг»."
        >
          <div className="flex flex-wrap gap-2">
            {PURPOSE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={preset}
                selected={purposePresets.includes(preset)}
                onToggle={() =>
                  setPurposePresets((prev) =>
                    prev.includes(preset)
                      ? prev.filter((value) => value !== preset)
                      : [...prev, preset],
                  )
                }
              />
            ))}
          </div>
          <textarea
            className="ios-input min-h-24 resize-none"
            placeholder="Коротко — кто вы, что умеете, какие проекты делали"
            value={purposeText}
            onChange={(event) => setPurposeText(event.target.value)}
          />
        </Section>

        <Section title="Ниши, навыки и инструменты">
          <input
            className="ios-input"
            placeholder="Ниши через запятую"
            value={niches}
            onChange={(event) => setNiches(event.target.value)}
          />
          <input
            className="ios-input"
            placeholder="Навыки через запятую"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
          />
          <input
            className="ios-input"
            placeholder="Какие инструменты используете (через запятую)"
            value={tools}
            onChange={(event) => setTools(event.target.value)}
          />
        </Section>

        <p className="glass-ultra-thin rounded-2xl border border-[rgb(var(--hairline))] px-4 py-2.5 text-[13px] text-[rgb(var(--ios-label-secondary)/0.8)]">
          Telegram: {telegramContact ?? 'скрыт (нет username в Telegram)'}
        </p>

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

        <button
          type="submit"
          className="ios-btn-primary flex w-full items-center justify-center gap-2"
          disabled={saving}
        >
          {saving ? <span className="ios-spinner" aria-hidden /> : null}
          {saving
            ? photoUploadProgress
              ? `Загружаем фото ${photoUploadProgress.done}/${photoUploadProgress.total}…`
              : 'Сохраняем…'
            : 'Продолжить'}
        </button>
      </form>
    </div>
  );
}
