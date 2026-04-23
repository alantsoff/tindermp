'use client';

import { Chip } from './Chip';

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
  { value: 'ASSISTANTS', label: 'Ассистенты' },
  { value: 'WHITE_IMPORT', label: 'Белый ввоз' },
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
        <Chip
          key={role.value}
          label={role.label}
          selected={value === role.value}
          onToggle={() => onChange(role.value)}
        />
      ))}
    </div>
  );
}
