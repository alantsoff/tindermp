'use client';

import { useEffect, useMemo, useRef, useState, type PointerEventHandler } from 'react';
import type { FeedCard } from '../_lib/api';
import { SwipeCard } from './SwipeCard';

type Props = {
  cards: FeedCard[];
  onDecision: (direction: 'LIKE' | 'PASS', card: FeedCard) => void;
};

const SWIPE_THRESHOLD_RATIO = 0.4;
const VELOCITY_THRESHOLD = 0.8;

export function SwipeStack({ cards, onDecision }: Props) {
  const topCard = cards[0] ?? null;
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlying, setIsFlying] = useState<'left' | 'right' | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset transient drag animation state when top card changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDx(0);
    setDy(0);
    setIsDragging(false);
    setIsFlying(null);
    startRef.current = null;
  }, [topCard?.id]);

  const transform = useMemo(() => {
    if (isFlying === 'left') return 'translate3d(-500px, 40px, 0) rotate(-20deg)';
    if (isFlying === 'right') return 'translate3d(500px, 40px, 0) rotate(20deg)';
    return `translate3d(${dx}px, ${dy}px, 0) rotate(${dx / 18}deg)`;
  }, [dx, dy, isFlying]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!topCard) return;
      if (event.key === 'ArrowLeft') onDecision('PASS', topCard);
      if (event.key === 'ArrowRight' || event.key === ' ') onDecision('LIKE', topCard);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecision, topCard]);

  if (!topCard) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-3xl border border-dashed border-zinc-700 text-zinc-400">
        Карточки закончились — обнови фильтры или зайди позже.
      </div>
    );
  }

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    setIsDragging(true);
    startRef.current = { x: event.clientX, y: event.clientY, t: performance.now() };
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!isDragging || !startRef.current) return;
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

    if ((passedDistance || passedVelocity) && topCard) {
      const direction = dx > 0 ? 'right' : 'left';
      setIsFlying(direction);
      window.setTimeout(() => {
        onDecision(direction === 'right' ? 'LIKE' : 'PASS', topCard);
      }, 250);
    } else {
      setDx(0);
      setDy(0);
    }
    setIsDragging(false);
    startRef.current = null;
  };

  const badge =
    dx > 20 ? (
      <div className="absolute left-4 top-4 rounded border border-emerald-300 bg-emerald-500/20 px-2 py-1 text-sm font-semibold text-emerald-200">
        LIKE
      </div>
    ) : dx < -20 ? (
      <div className="absolute right-4 top-4 rounded border border-red-300 bg-red-500/20 px-2 py-1 text-sm font-semibold text-red-200">
        NOPE
      </div>
    ) : null;

  return (
    <div ref={containerRef} className="relative h-[480px] w-full">
      {cards.slice(1, 3).map((card, index) => (
        <div
          key={card.id}
          className="absolute inset-0"
          style={{
            transform: `scale(${1 - (index + 1) * 0.03}) translateY(${(index + 1) * 10}px)`,
            opacity: 0.6 - index * 0.15,
          }}
        >
          <SwipeCard card={card} />
        </div>
      ))}
      <div
        className="absolute inset-0 touch-none transition-transform duration-250 ease-out"
        style={{ transform }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {badge}
        <SwipeCard card={topCard} />
      </div>
    </div>
  );
}
