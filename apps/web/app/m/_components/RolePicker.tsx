'use client';

export const MATCH_ROLES = [
  { value: 'SELLER', label: 'Селлер' },
  { value: 'MANAGER', label: 'Менеджер' },
  { value: 'DESIGNER', label: 'Дизайнер' },
  { value: 'AD_BUYER', label: 'Трафик' },
  { value: 'EXPERT', label: 'Эксперт' },
  { value: 'PRODUCTION', label: 'Производство' },
  { value: 'FULFILLMENT', label: 'Фулфилмент' },
  { value: 'CARGO', label: 'Карго' },
  { value: 'ANALYTICS_SERVICE', label: 'Сервис аналитики' },
  { value: 'LOGISTIC', label: 'Логист' },
  { value: 'BLOGGER', label: 'Блогер' },
  { value: 'ACCOUNTANT', label: 'Бухгалтер' },
  { value: 'LAWYER', label: 'Юрист' },
  { value: 'PRODUCT_SOURCER', label: 'Подборщик товара' },
  { value: 'CUSTOM', label: 'Свой вариант' },
] as const;

export function RolePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MATCH_ROLES.map((role) => (
        <button
          key={role.value}
          type="button"
          className={`rounded-xl border px-3 py-2 text-sm ${
            value === role.value ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-zinc-700 text-zinc-300'
          }`}
          onClick={() => onChange(role.value)}
        >
          {role.label}
        </button>
      ))}
    </div>
  );
}
