import { randomBytes } from 'node:crypto';

export function isFeatureEnabled(
  raw: string | undefined,
  fallback = false,
): boolean {
  if (raw == null) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Fail-safe проверка invite-only режима. Используется и в `ProfileService`
 * (валидация кода при создании профиля), и в `MatchMaintenanceService`
 * (периодические гранты). Вынесено в utils, чтобы правила совпадали
 * в обоих местах. Поведение:
 *   - переменная не задана / пустая → true (invite-only ON)
 *   - `0`/`false`/`no`/`off` → false (OFF)
 *   - всё остальное (включая `1`, `true`, `yes`, опечатки) → true
 */
export function isInviteOnlyModeEnabled(): boolean {
  const raw = process.env.MATCH_INVITE_ONLY?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return true;
}

export function getNumberEnv(
  raw: string | undefined,
  fallback: number,
): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function startOfMoscowDay(date: Date): Date {
  const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const day = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()),
  );
  return new Date(day.getTime() - 3 * 60 * 60 * 1000);
}

export function daysBetween(from: Date, to: Date): number {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function addDaysUtc(date: Date, days: number): Date {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

export function extractTelegramIdByEmail(email?: string | null): string | null {
  if (!email) return null;
  const match = email.match(/^tg_(\d+)@/);
  return match ? match[1] : null;
}

export function pluralize(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 10 символов × алфавит 32 = 32^10 ≈ 1.1e15 комбинаций.
// Раньше было 8 символов (32^8 ≈ 1.1e12) — этого недостаточно
// при отсутствии rate-limit на редим (brute-force по свежевыданным кодам).
const INVITE_CODE_LENGTH = 10;

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  const chars = Array.from(
    bytes,
    (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length],
  );
  const half = INVITE_CODE_LENGTH / 2;
  return `${chars.slice(0, half).join('')}-${chars.slice(half).join('')}`;
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export const INVITE_CONFIG = {
  INITIAL_GRANT: 5,
  PERIODIC_GRANT: 1,
  PERIODIC_INTERVAL_DAYS: 30,
  MAX_BALANCE: 20,
  ACTIVITY_WINDOW_DAYS: 30,
} as const;

export function toAdminEmailByTelegramId(telegramId: string): string {
  return `tg_${telegramId}@telegram-trends.dev`;
}

const ZODIAC_BY_DATE = [
  { sign: 'Козерог', from: [1, 1], to: [1, 19] },
  { sign: 'Водолей', from: [1, 20], to: [2, 18] },
  { sign: 'Рыбы', from: [2, 19], to: [3, 20] },
  { sign: 'Овен', from: [3, 21], to: [4, 19] },
  { sign: 'Телец', from: [4, 20], to: [5, 20] },
  { sign: 'Близнецы', from: [5, 21], to: [6, 20] },
  { sign: 'Рак', from: [6, 21], to: [7, 22] },
  { sign: 'Лев', from: [7, 23], to: [8, 22] },
  { sign: 'Дева', from: [8, 23], to: [9, 22] },
  { sign: 'Весы', from: [9, 23], to: [10, 22] },
  { sign: 'Скорпион', from: [10, 23], to: [11, 21] },
  { sign: 'Стрелец', from: [11, 22], to: [12, 21] },
  { sign: 'Козерог', from: [12, 22], to: [12, 31] },
] as const;

export function zodiacByBirthDate(date: Date): string {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  for (const item of ZODIAC_BY_DATE) {
    const [fromMonth, fromDay] = item.from;
    const [toMonth, toDay] = item.to;
    const inRange =
      (month > fromMonth || (month === fromMonth && day >= fromDay)) &&
      (month < toMonth || (month === toMonth && day <= toDay));
    if (inRange) return item.sign;
  }
  return 'Козерог';
}

const MOSCOW_REGION_CITIES = new Set([
  'москва',
  'мск',
  'moscow',
  'санкт-петербург',
  'спб',
  'питер',
  'saint petersburg',
]);

export function normalizeCity(city?: string | null): string {
  return city?.trim().toLowerCase() ?? '';
}

export function isMoscowRegion(city?: string | null): boolean {
  const normalized = normalizeCity(city);
  if (!normalized) return false;
  return MOSCOW_REGION_CITIES.has(normalized);
}

/**
 * Profile completeness heuristic in [0, 1]. Used by:
 * - anti-bot shadow signal (cheap signal that pairs with activity × reciprocity)
 * - future: nudging low-completeness users to fill the profile.
 *
 * Weights are deliberately round numbers — they're compared to fixed
 * thresholds (e.g. `< 0.5` for suspicion), not multiplied into other
 * formulas, so precision is irrelevant here. Change freely.
 */
export function profileCompleteness(profile: {
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  experience?: number | null;
  niches?: string[] | null;
  skills?: string[] | null;
  workFormats?: string[] | null;
  photos?: Array<unknown> | null;
}): number {
  let score = 0;
  const hasText = (v?: string | null) => !!(v && v.trim().length >= 2);
  const hasList = (v?: unknown[] | null) => !!(v && v.length > 0);

  if (hasText(profile.headline)) score += 0.2;
  if (hasText(profile.bio)) score += 0.15;
  if (hasText(profile.city)) score += 0.1;
  if (typeof profile.experience === 'number' && profile.experience > 0)
    score += 0.1;
  if (hasText(profile.avatarUrl) || (profile.photos?.length ?? 0) >= 1)
    score += 0.2;
  if ((profile.photos?.length ?? 0) >= 2) score += 0.05;
  if (hasList(profile.niches)) score += 0.1;
  if (hasList(profile.skills)) score += 0.05;
  if (hasList(profile.workFormats)) score += 0.05;
  return Math.min(1, score);
}
