import { MATCH_ROLES } from '../_components/RolePicker';

export function getRoleLabel(
  role?: string | null,
  roleCustom?: string | null,
): string | null {
  if (!role) return null;
  if (role === 'CUSTOM') return roleCustom?.trim() || 'Свой вариант';
  return MATCH_ROLES.find((item) => item.value === role)?.label ?? role;
}

export function getExperienceLabel(experience?: number | null): string | null {
  if (experience == null || Number.isNaN(experience)) return null;
  const years = Math.max(0, Math.min(15, Math.trunc(experience)));
  if (years === 0) return '0 лет опыта';
  const mod10 = years % 10;
  const mod100 = years % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'год'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'года'
        : 'лет';
  return `${years} ${suffix} опыта`;
}

