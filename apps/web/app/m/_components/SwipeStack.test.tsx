import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedCard } from '../_lib/api';
import { SwipeStack } from './SwipeStack';

const cards: FeedCard[] = [
  {
    id: 'p1',
    role: 'SELLER',
    roleCustom: null,
    roleLabel: 'SELLER',
    displayName: 'Алиса',
    headline: 'Ищу команду',
    bio: null,
    city: null,
    niches: ['wb'],
    skills: ['ads'],
    priceMin: null,
    priceMax: null,
    currency: 'RUB',
    avatarUrl: null,
    portfolioUrl: null,
    telegramContact: null,
    isActive: true,
  },
];

describe('SwipeStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers LIKE when dragged far to the right', () => {
    const onDecision = vi.fn();
    render(<SwipeStack cards={cards} onDecision={onDecision} />);

    expect(screen.getByText('Алиса')).toBeInTheDocument();
    const card = document.querySelector('.touch-none') as HTMLElement;
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });

    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(card, { clientX: 200, clientY: 10 });
    fireEvent.pointerUp(card);

    vi.advanceTimersByTime(300);
    expect(onDecision).toHaveBeenCalled();
  });
});
