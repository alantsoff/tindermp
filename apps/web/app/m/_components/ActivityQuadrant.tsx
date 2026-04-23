'use client';

import type { MatchActivityQuadrant } from '../_lib/api';

type Props = {
  /** Which quadrant to highlight. `null` = show neutral/welcome state. */
  active: MatchActivityQuadrant | null;
  /** Compact variant — smaller type, suitable for inline usage. */
  compact?: boolean;
};

/**
 * Four-cell SVG representation of the activity × reciprocity matrix,
 * reused in the profile "Ваша активность" section. The active quadrant
 * gets a saturated tint; others fade to neutral so the user sees where
 * they sit without the others competing for attention.
 *
 * Colours come from iOS system tokens so dark/light themes just work.
 * Quadrant copy is intentionally short — the longer coaching text lives
 * next to the SVG, not inside it.
 */
export function ActivityQuadrant({ active, compact = false }: Props) {
  const cells: Array<{
    id: MatchActivityQuadrant;
    label: string;
    // Y-positions map to the conceptual grid (top = high reciprocity):
    row: 0 | 1;
    col: 0 | 1;
    tone: string; // rgb(var(--…)) triplet reference
  }> = [
    { id: 'SELECTIVE',    label: 'Селективный',    row: 0, col: 0, tone: 'var(--ios-blue)' },
    { id: 'SOUGHT_AFTER', label: 'Востребованный', row: 0, col: 1, tone: 'var(--ios-green)' },
    { id: 'SLEEPING',     label: 'Спящий',         row: 1, col: 0, tone: 'var(--ios-gray)' },
    { id: 'OVER_LIKER',   label: 'Over-liker',     row: 1, col: 1, tone: 'var(--ios-orange)' },
  ];

  const CELL_W = 130;
  const CELL_H = 90;
  const GAP = 6;
  const PAD_L = 30;
  const PAD_B = 28;
  const PAD_T = 10;
  const PAD_R = 10;

  const totalW = PAD_L + CELL_W * 2 + GAP + PAD_R;
  const totalH = PAD_T + CELL_H * 2 + GAP + PAD_B;

  const fontScale = compact ? 0.9 : 1;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Квадрант активности"
      className="w-full max-w-[320px]"
      style={{ display: 'block' }}
    >
      {/* Cells */}
      {cells.map((cell) => {
        const x = PAD_L + cell.col * (CELL_W + GAP);
        const y = PAD_T + cell.row * (CELL_H + GAP);
        const isActive = cell.id === active;
        const fillAlpha = isActive ? 0.22 : 0.06;
        const strokeAlpha = isActive ? 0.55 : 0;
        const textColor = isActive
          ? `rgb(${cell.tone})`
          : 'rgb(var(--ios-label-secondary)/0.6)';
        return (
          <g key={cell.id}>
            <rect
              x={x}
              y={y}
              width={CELL_W}
              height={CELL_H}
              rx={14}
              fill={`rgb(${cell.tone}/${fillAlpha})`}
              stroke={`rgb(${cell.tone}/${strokeAlpha})`}
              strokeWidth={isActive ? 1.5 : 0}
            />
            <text
              x={x + CELL_W / 2}
              y={y + CELL_H / 2 + 4}
              textAnchor="middle"
              fontSize={14 * fontScale}
              fontWeight={isActive ? 700 : 500}
              fill={textColor}
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro", sans-serif',
              }}
            >
              {cell.label}
            </text>
          </g>
        );
      })}

      {/* Y axis label (rotated) */}
      <text
        x={10}
        y={PAD_T + CELL_H + GAP / 2}
        transform={`rotate(-90, 10, ${PAD_T + CELL_H + GAP / 2})`}
        textAnchor="middle"
        fontSize={10 * fontScale}
        fill="rgb(var(--ios-label-secondary)/0.7)"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro", sans-serif',
        }}
      >
        отклик
      </text>
      {/* X axis label */}
      <text
        x={PAD_L + (CELL_W * 2 + GAP) / 2}
        y={totalH - 10}
        textAnchor="middle"
        fontSize={10 * fontScale}
        fill="rgb(var(--ios-label-secondary)/0.7)"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro", sans-serif',
        }}
      >
        активность →
      </text>
    </svg>
  );
}

// Public dictionary of coaching lines, keyed by quadrant. Exported so
// the profile section can render the right tone without duplicating the
// strings. Rules of voice (see plan §5.3): no percentages, no comparison
// to others, no "rating" language.
export const ACTIVITY_QUADRANT_COPY: Record<
  MatchActivityQuadrant,
  { title: string; body: string }
> = {
  SOUGHT_AFTER: {
    title: 'Вас активно лайкают',
    body: 'Вы в активном ядре комьюнити — приглашайте знакомых по своим инвайтам, нам важно растить такое ядро.',
  },
  SELECTIVE: {
    title: 'Ваш профиль заходит',
    body: 'Вас часто лайкают, но сами вы смотрите ленту не каждый день. Загляните — там могут быть интересные предложения.',
  },
  OVER_LIKER: {
    title: 'Попробуйте быть избирательнее',
    body: 'Вы свайпаете чаще, чем большинство. Людям с заполненным headline и 2-3 фото отвечают взаимностью заметно чаще.',
  },
  SLEEPING: {
    title: 'Давайте раскачаемся',
    body: 'Заполните профиль до конца и полистайте ленту — алгоритм сам подберёт свежих кандидатов.',
  },
};
