'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEventHandler,
} from 'react';
import type { FeedCard } from '../_lib/api';
import { SwipeCard } from './SwipeCard';

type Props = {
  cards: FeedCard[];
  onDecision: (direction: 'LIKE' | 'PASS', card: FeedCard) => void;
  onCardTap?: (card: FeedCard) => void;
};

const SWIPE_THRESHOLD_RATIO = 0.4;
const VELOCITY_THRESHOLD = 0.8;
const FLY_DURATION_MS = 320;
const RETURN_DURATION_MS = 420;
// Если суммарный сдвиг пальца меньше этого порога — считаем жест тапом,
// а не свайпом: открываем подробный профиль.
const TAP_MOVEMENT_THRESHOLD_PX = 8;

export function SwipeStack({ cards, onDecision, onCardTap }: Props) {
  const topCard = cards[0] ?? null;
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState<'left' | 'right' | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isDraggingRef = useRef(false);
  // Если жест начался на интерактивном элементе внутри карточки
  // (кнопки переключения фото, ссылки) — не считаем это тапом по карточке.
  const startedOnInteractiveRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    // Reset transient drag animation state when top card changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDx(0);
    setDy(0);
    setIsDragging(false);
    setIsFlying(null);
    setIsReturning(false);
    startRef.current = null;
    isDraggingRef.current = false;
  }, [topCard?.id]);

  const transform = useMemo(() => {
    if (isFlying === 'left') {
      return 'translate3d(-140vw, 80px, 0) rotate(-24deg)';
    }
    if (isFlying === 'right') {
      return 'translate3d(140vw, 80px, 0) rotate(24deg)';
    }
    // Rotation scales with horizontal movement and slightly with vertical
    // offset — feels like tilting a card rather than rigid shift.
    const rotation = dx / 20;
    return `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`;
  }, [dx, dy, isFlying]);

  // Different transitions for "dragging", "flying out", and "returning to center".
  const transition = useMemo(() => {
    if (isDragging) return 'none';
    if (isFlying) {
      return `transform ${FLY_DURATION_MS}ms var(--ease-swipe-fly)`;
    }
    if (isReturning) {
      return `transform ${RETURN_DURATION_MS}ms var(--ease-swipe-return)`;
    }
    return `transform ${RETURN_DURATION_MS}ms var(--ease-ios)`;
  }, [isDragging, isFlying, isReturning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!topCard) return;
      if (event.key === 'ArrowLeft') onDecision('PASS', topCard);
      if (event.key === 'ArrowRight' || event.key === ' ') {
        onDecision('LIKE', topCard);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecision, topCard]);

  if (!topCard) {
    return <div className="h-[500px] w-full" />;
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    setIsReturning(false);
    const target = event.target as HTMLElement | null;
    startedOnInteractiveRef.current = Boolean(
      target?.closest('button, a, input, textarea, select, [role="button"]'),
    );
    startRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
    };
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!isDraggingRef.current || !startRef.current) return;
    setDx(event.clientX - startRef.current.x);
    setDy(event.clientY - startRef.current.y);
  };

  const onPointerUp: PointerEventHandler<HTMLDivElement> = () => {
    if (!startRef.current) return;
    const elapsed = Math.max(performance.now() - startRef.current.t, 1);
    const velocity = Math.abs(dx) / elapsed;
    const width = containerRef.current?.clientWidth ?? window.innerWidth;
    const passedDistance = Math.abs(dx) > width * SWIPE_THRESHOLD_RATIO;
    const passedVelocity = velocity > VELOCITY_THRESHOLD;
    const totalMovement = Math.abs(dx) + Math.abs(dy);
    const startedOnInteractive = startedOnInteractiveRef.current;
    startedOnInteractiveRef.current = false;

    if ((passedDistance || passedVelocity) && topCard) {
      const direction = dx > 0 ? 'right' : 'left';
      isDraggingRef.current = false;
      setIsDragging(false);
      setIsFlying(direction);
      window.setTimeout(() => {
        onDecision(direction === 'right' ? 'LIKE' : 'PASS', topCard);
      }, FLY_DURATION_MS);
    } else {
      isDraggingRef.current = false;
      setIsDragging(false);
      setIsReturning(true);
      setDx(0);
      setDy(0);
      window.setTimeout(() => setIsReturning(false), RETURN_DURATION_MS);

      // Тап: палец почти не двигался и не попал на внутреннюю кнопку карточки
      // (переключатели фото и т.п.). Открываем полный профиль.
      if (
        topCard &&
        onCardTap &&
        !startedOnInteractive &&
        totalMovement < TAP_MOVEMENT_THRESHOLD_PX
      ) {
        onCardTap(topCard);
      }
    }
    startRef.current = null;
  };

  const likeOpacity = Math.min(Math.max(dx / 100, 0), 1);
  const nopeOpacity = Math.min(Math.max(-dx / 100, 0), 1);
  // Card scales up slightly as user drags sideways — feels responsive.
  const dragMagnitude = Math.min(Math.abs(dx) / 220, 1);
  const cardScale = 1 + dragMagnitude * 0.015;

  return (
    <div ref={containerRef} className="relative h-[500px] w-full">
      {cards.slice(1, 3).map((card, index) => {
        // Подложка лежит статично: без scale/transition, чтобы
        // следующая карточка не "возвращалась" при смене top card.
        const baseScale = 1 - (index + 1) * 0.03;
        const baseOffset = (index + 1) * 12;
        return (
          <div
            key={card.id}
            className="absolute inset-0"
            style={{
              transform: `scale(${baseScale}) translateY(${baseOffset}px)`,
              opacity: 1,
              zIndex: 2 - index,
              pointerEvents: 'none',
              transition: 'none',
              willChange: 'auto',
            }}
          >
            <SwipeCard card={card} />
          </div>
        );
      })}
      <div
        key={topCard.id}
        className="absolute inset-0 touch-none"
        style={{
          zIndex: 10,
          transform: `${transform} scale(${cardScale})`,
          transition,
          willChange: isDragging || isFlying || isReturning ? 'transform' : 'auto',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-5 top-5 z-10 rotate-[-12deg] rounded-xl border-[3px] px-3 py-1.5 text-base font-bold uppercase tracking-widest"
          style={{
            opacity: likeOpacity,
            transform: `scale(${0.85 + likeOpacity * 0.2})`,
            color: 'rgb(var(--ios-green))',
            borderColor: 'rgb(var(--ios-green))',
            transition:
              'opacity var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-ios)',
          }}
        >
          Like
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute right-5 top-5 z-10 rotate-[12deg] rounded-xl border-[3px] px-3 py-1.5 text-base font-bold uppercase tracking-widest"
          style={{
            opacity: nopeOpacity,
            transform: `scale(${0.85 + nopeOpacity * 0.2})`,
            color: 'rgb(var(--ios-red))',
            borderColor: 'rgb(var(--ios-red))',
            transition:
              'opacity var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-ios)',
          }}
        >
          Nope
        </div>
        <SwipeCard card={topCard} />
      </div>
    </div>
  );
}
