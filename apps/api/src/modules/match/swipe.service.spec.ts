import { SwipeService } from './swipe.service';

describe('SwipeService', () => {
  const prisma = {
    matchProfile: { findUnique: jest.fn(), findMany: jest.fn() },
    matchSwipe: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    matchPair: { upsert: jest.fn(), findMany: jest.fn() },
  } as any;

  beforeEach(() => {
    process.env.MATCH_BOT_TOKEN = '';
    process.env.MATCH_MINIAPP_URL = '';
    prisma.matchProfile.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        if (where.id === 'a') {
          return Promise.resolve({
            id: 'a',
            displayName: 'A',
            headline: null,
            avatarUrl: null,
            role: 'SELLER',
            roleCustom: null,
            telegramContact: null,
            user: { telegramId: '1' },
          });
        }
        return Promise.resolve({
          id: 'b',
          displayName: 'B',
          headline: null,
          avatarUrl: null,
          role: 'MANAGER',
          roleCustom: null,
          telegramContact: '@b',
          user: { telegramId: '2' },
        });
      },
    );
    prisma.matchSwipe.findUnique.mockResolvedValue({ direction: 'LIKE' });
    prisma.matchPair.upsert.mockResolvedValue({ id: 'pair-1' });
    prisma.matchSwipe.findFirst.mockResolvedValue(null);
  });

  it('creates match on mutual like and returns partner payload', async () => {
    const service = new SwipeService(prisma);
    const result = await service.swipe('a', 'b', 'LIKE');

    expect(prisma.matchPair.upsert).toHaveBeenCalled();
    expect(result.matched).toBe(true);
    expect(result.pairId).toBe('pair-1');
    expect(result.partner?.id).toBe('b');
  });

  it('undo returns false when there is no swipe', async () => {
    const service = new SwipeService(prisma);
    const result = await service.undoLastSwipe('a');

    expect(result).toEqual({ undone: false });
  });
});
