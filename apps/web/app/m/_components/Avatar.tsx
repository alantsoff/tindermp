'use client';

import { resolveMediaUrl } from '../_lib/media';

function hueFromString(value: string): number {
  let hue = 0;
  for (let i = 0; i < value.length; i += 1) {
    hue = (hue * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hue % 360;
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveMediaUrl(url)}
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-[rgb(var(--hairline))]"
        style={{ width: size, height: size }}
        alt={name}
      />
    );
  }

  const hue = hueFromString(name || 'X');
  const gradient = `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${(hue + 40) % 360} 80% 48%))`;
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.42);

  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white ring-1 ring-[rgb(var(--hairline))]"
      style={{
        width: size,
        height: size,
        background: gradient,
        fontSize,
        letterSpacing: '-0.02em',
      }}
    >
      {initial}
    </div>
  );
}
