'use client';

import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Hand,
  Heart,
  MessageCircleHeart,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '../_lib/telegram';

export const TUTORIAL_STORAGE_KEY = 'matchTutorialCompletedV1';

type TutorialSlide = {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  gradient: string; // css gradient for the icon pill + halo
};

const SLIDES: TutorialSlide[] = [
  {
    id: 'welcome',
    icon: <Sparkles size={30} className="text-white" strokeWidth={2.4} />,
    title: 'Добро пожаловать в Match',
    body: 'Match — место, где селлеры, продакты и специалисты находят команду, клиентов и партнёров по e-com.',
    gradient:
      'linear-gradient(135deg, rgb(var(--ios-pink)), rgb(var(--ios-indigo)))',
  },
  {
    id: 'swipe',
    icon: <Hand size={28} className="text-white" strokeWidth={2.4} />,
    title: 'Листайте карточки',
    body: 'Вправо — интересно, влево — мимо. Ошиблись? Жёлтая кнопка UNDO вернёт последний свайп. Тапните по карточке — откроется полный профиль.',
    gradient:
      'linear-gradient(135deg, rgb(var(--ios-teal)), rgb(var(--ios-indigo)))',
  },
  {
    id: 'match',
    icon: <MessageCircleHeart size={28} className="text-white" strokeWidth={2.4} />,
    title: 'Взаимный лайк — это матч',
    body: 'Если человек лайкнул вас в ответ — открывается чат во вкладке «Матчи». Там же можно перейти в Telegram.',
    gradient:
      'linear-gradient(135deg, rgb(var(--ios-red)), rgb(var(--ios-pink)))',
  },
  {
    id: 'limits',
    icon: <Heart size={28} className="text-white" strokeWidth={2.4} />,
    title: 'Есть дневной лимит лайков',
    body: 'Счётчик справа вверху показывает текущий streak и лимит лайков на сегодня. Это чтобы свайпали осознанно, а не подряд.',
    gradient:
      'linear-gradient(135deg, rgb(var(--ios-orange)), rgb(var(--ios-red)))',
  },
  {
    id: 'invite',
    icon: <UserPlus size={28} className="text-white" strokeWidth={2.4} />,
    title: 'Приглашайте своих',
    body: 'В профиле есть инвайт-коды — поделитесь ими с сильными специалистами, которых хотите видеть в комьюнити.',
    gradient:
      'linear-gradient(135deg, rgb(var(--ios-green)), rgb(var(--ios-teal)))',
  },
];

type Props = {
  open: boolean;
  onFinish: () => void;
};

export function WelcomeTutorial({ open, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const draggingRef = useRef(false);

  const lastIndex = SLIDES.length - 1;
  const slide = SLIDES[index];
  const isLast = index === lastIndex;

  // Haptic ping on mount so it feels like a real intro, not a silent popup.
  useEffect(() => {
    if (!open) return;
    hapticNotification('success');
  }, [open]);

  // Reset slide index every time the tutorial opens — otherwise a stale
  // index from a previous open could land us on the wrong slide.
  // The `await Promise.resolve()` keeps react-hooks/set-state-in-effect
  // happy (same pattern as onboarding/page.tsx).
  useEffect(() => {
    let cancelled = false;
    const reset = async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (open) setIndex(0);
    };
    void reset();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(lastIndex, nextIndex));
      if (clamped !== index) {
        hapticImpact('light');
        setIndex(clamped);
      }
    },
    [index, lastIndex],
  );

  const finish = useCallback(() => {
    hapticNotification('success');
    onFinish();
  }, [onFinish]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Ignore multi-touch and right/middle mouse — only a clean primary drag
    // should start a swipe. This keeps the scroll-free overlay predictable.
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
    draggingRef.current = false;
    setIsDragging(false);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!draggingRef.current) {
      // Enter drag mode only after a horizontal intent is clear — otherwise
      // vertical scrolls (which we don't have here, but still) would hijack
      // the tutorial swipe.
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      draggingRef.current = true;
      setIsDragging(true);
    }
    // Rubber-band at the edges so you feel the wall.
    const atLeftEdge = index === 0 && dx > 0;
    const atRightEdge = isLast && dx < 0;
    const damped = atLeftEdge || atRightEdge ? dx / 3 : dx;
    setDragDx(damped);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = dragDx;
    pointerStartRef.current = null;
    draggingRef.current = false;
    setIsDragging(false);
    setDragDx(0);
    if (Math.abs(dx) < 48) return;
    if (dx < 0 && !isLast) goTo(index + 1);
    else if (dx > 0 && index > 0) goTo(index - 1);
  };

  const dotIndicators = useMemo(
    () =>
      SLIDES.map((_, idx) => (
        <button
          key={idx}
          type="button"
          aria-label={`Перейти к шагу ${idx + 1}`}
          onClick={() => goTo(idx)}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: idx === index ? 22 : 6,
            background:
              idx === index
                ? 'rgb(var(--ios-tint))'
                : 'rgb(var(--ios-label-tertiary) / 0.5)',
          }}
        />
      )),
    [index, goTo],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Как пользоваться Match"
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
    >
      {/* Backdrop: we don't close on backdrop tap — skip button is explicit. */}
      <div
        aria-hidden
        className="animate-backdrop-in absolute inset-0 bg-black/45 backdrop-blur-xl"
      />

      <div
        className="glass glass-edge animate-pop-in relative flex w-full max-w-[430px] flex-col overflow-hidden rounded-[28px]"
        style={{
          backgroundImage:
            'radial-gradient(120% 140% at 50% 0%, rgb(var(--ios-tint)/0.22), transparent 60%),' +
            'radial-gradient(120% 120% at 50% 110%, rgb(var(--ios-pink)/0.18), transparent 60%)',
        }}
      >
        {/* Top bar: dots + skip */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-1.5">{dotIndicators}</div>
          <button
            type="button"
            onClick={finish}
            className="text-[14px] font-medium text-[rgb(var(--ios-label-secondary))] transition active:opacity-60"
          >
            Пропустить
          </button>
        </div>

        {/* Slide content (draggable) */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="touch-pan-y select-none px-6 pb-2 pt-6"
          style={{ touchAction: 'pan-y' }}
        >
          <div
            className="transition-transform"
            style={{
              transform: `translate3d(${dragDx}px, 0, 0)`,
              transitionDuration: isDragging ? '0ms' : '200ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: slide.gradient,
                boxShadow: '0 14px 40px -12px rgb(var(--ios-tint) / 0.55)',
              }}
            >
              {slide.icon}
            </div>

            <h2 className="ios-title mb-2 text-center tracking-tight">
              {slide.title}
            </h2>
            <p className="mx-auto max-w-[320px] text-center text-[15px] leading-snug text-[rgb(var(--ios-label-secondary)/0.95)]">
              {slide.body}
            </p>
          </div>
        </div>

        {/* CTA row */}
        <div className="space-y-2 px-5 pb-5 pt-4">
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="ios-btn-primary w-full"
            >
              Начать
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="ios-btn-primary w-full"
            >
              Далее
            </button>
          )}
          {index > 0 && !isLast ? (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="ios-btn-plain w-full"
            >
              Назад
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
