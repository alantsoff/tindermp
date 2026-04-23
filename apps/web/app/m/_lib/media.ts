/**
 * API хранит относительные пути `/match-media/photos/...` (см. photos.service).
 * В Mini App запросы к картинке должны идти с **того же origin**, что и веб
 * (Next rewrites `/match-media` → API). Склейка только через NEXT_PUBLIC_API_URL
 * ломается, если env указывает на другой домен или неверный путь.
 */
export function resolveMediaUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  if (raw.startsWith('//')) return `https:${raw}`;

  if (typeof window !== 'undefined' && window.location?.origin) {
    if (raw.startsWith('/')) {
      return `${window.location.origin}${raw}`;
    }
    return `${window.location.origin}/${raw}`;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';
  if (raw.startsWith('/')) {
    return apiBase ? `${apiBase}${raw}` : raw;
  }
  return apiBase ? `${apiBase}/${raw}` : raw;
}
