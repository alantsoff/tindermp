export const WORK_FORMAT_LABELS = {
  REMOTE: 'Удалённо',
  OFFICE: 'В офисе',
  HYBRID: 'Гибрид',
} as const;

export const MARKETPLACE_LABELS = {
  WB: 'Wildberries',
  OZON: 'OZON',
  YANDEX_MARKET: 'Яндекс.Маркет',
  MVIDEO: 'МВидео',
  LAMODA: 'Lamoda',
  OTHER: 'Другое',
} as const;

export const MARKETPLACE_SHORT = {
  WB: 'WB',
  OZON: 'OZON',
  YANDEX_MARKET: 'ЯМ',
  MVIDEO: 'МВидео',
  LAMODA: 'Lamoda',
  OTHER: '...',
} as const;

export type MatchWorkFormatValue = keyof typeof WORK_FORMAT_LABELS;
export type MatchMarketplaceValue = keyof typeof MARKETPLACE_LABELS;

