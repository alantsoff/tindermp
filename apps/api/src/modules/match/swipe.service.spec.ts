import { SwipeService } from './swipe.service';

describe('SwipeService', () => {
  const eventLogger = { log: jest.fn() };
  const favoriteRows = [
    {
      id: 'sw-like-open',
      fromProfileId: 'a',
      toProfileId: 'b',
      direction: 'LIKE',
      isSuperLike: false,
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      toProfile: {
        id: 'b',
        displayName: 'B',
        role: 'MANAGER',
        roleCustom: null,
        headline: 'Найму сильного селлера',
        city: 'Москва',
        niches: ['электроника'],
        avatarUrl: null,
        bannedAt: null,
        pausedUntil: null,
        photos: [{ id: 'ph-b', url: 'https://img/b.jpg', order: 0 }],
      },
    },
    {
      id: 'sw-like-mutual',
      fromProfileId: 'a',
      toProfileId: 'c',
      direction: 'LIKE',
      isSuperLike: false,
      createdAt: new Date('2026-04-10T11:00:00.000Z'),
      toProfile: {
        id: 'c',
        displayName: 'C',
        role: 'SELLER',
        roleCustom: null,
        headline: 'Ищу PPC',
        city: 'Казань',
        niches: ['одежда'],
        avatarUrl: null,
        bannedAt: null,
        pausedUntil: null,
        photos: [],
      },
    },
    {
      id: 'sw-pass',
      fromProfileId: 'a',
      toProfileId: 'd',
      direction: 'PASS',
      isSuperLike: false,
      createdAt: new Date('2026-04-10T12:00:00.000Z'),
      toProfile: {
        id: 'd',
        displayName: 'D',
        role: 'MANAGER',
        roleCustom: null,
        headline: null,
        city: null,
        niches: [],
        avatarUrl: null,
        bannedAt: null,
        pausedUntil: null,
        photos: [],
      },
    },
    {
      id: 'sw-like-super',
      fromProfileId: 'a',
      toProfileId: 'e',
      direction: 'LIKE',
      isSuperLike: true,
      createdAt: new Date('2026-04-10T13:00:00.000Z'),
      toProfile: {
        id: 'e',
        displayName: 'E',
        role: 'SELLER',
        roleCustom: null,
        headline: 'Super like me',
        city: 'Самара',
        niches: ['косметика'],
        avatarUrl: 'https://img/e.jpg',
        bannedAt: null,
        pausedUntil: null,
        photos: [],
      },
    },
    {
      id: 'sw-like-banned',
      fromProfileId: 'a',
      toProfileId: 'f',
      direction: 'LIKE',
      isSuperLike: false,
      createdAt: new Date('2026-04-10T14:00:00.000Z'),
      toProfile: {
        id: 'f',
        displayName: 'F',
        role: 'SELLER',
        roleCustom: null,
        headline: 'Banned partner',
        city: 'СПб',
        niches: ['товары для дома'],
        avatarUrl: null,
        bannedAt: new Date('2026-04-01T00:00:00.000Z'),
        pausedUntil: null,
        photos: [],
      },
    },
  ];
  const inboundSwipesByTarget: Record<string, Array<{ direction: 'LIKE' | 'PASS' }>> = {
    c: [{ direction: 'LIKE' }],
  };
  const prisma = {
    matchProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    matchSwipe: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    matchPair: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    matchPairRead: { createMany: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
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
    prisma.matchPair.upsert.mockResolvedValue({
      id: 'pair-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.matchSwipe.findFirst.mockResolvedValue(null);
    prisma.matchSwipe.findMany.mockImplementation(
      ({ where }: { where: { fromProfileId?: string; direction?: string } }) => {
        const rows = favoriteRows.filter((row) => {
          if (where.fromProfileId && row.fromProfileId !== where.fromProfileId)
            return false;
          if (where.direction && row.direction !== where.direction) return false;
          const inbound = inboundSwipesByTarget[row.toProfileId] ?? [];
          const hasMutualLike = inbound.some((swipe) => swipe.direction === 'LIKE');
          if (hasMutualLike) return false;
          return true;
        });
        return Promise.resolve(rows);
      },
    );
    prisma.matchSwipe.count.mockResolvedValue(0);
    prisma.matchProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });
  });

  describe('swipe/undo basics', () => {
    it('creates match on mutual like and returns partner payload', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      const result = await service.swipe('a', 'b', 'LIKE');

      expect(prisma.matchPair.upsert).toHaveBeenCalled();
      expect(result.matched).toBe(true);
      expect(result.pairId).toBe('pair-1');
      expect(result.partner?.id).toBe('b');
    });

    it('undo returns false when there is no swipe', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      const result = await service.undoLastSwipe('a');

      expect(result).toEqual({ undone: false });
    });
  });

  describe('getFavorites', () => {
    it('returns unilateral likes, excludes mutual and pass, keeps super-like and availability', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      const result = await service.getFavorites('a');

      expect(prisma.matchSwipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fromProfileId: 'a',
            direction: 'LIKE',
          }),
        }),
      );
      expect(result.map((item) => item.partner.id)).toEqual(['b', 'e', 'f']);
      expect(result.some((item) => item.partner.id === 'c')).toBe(false);
      expect(result.some((item) => item.partner.id === 'd')).toBe(false);
      expect(
        result.find((item) => item.partner.id === 'e')?.isSuperLike,
      ).toBe(true);
      expect(
        result.find((item) => item.partner.id === 'f')?.partner.isAvailable,
      ).toBe(false);
    });
  });

  describe('removeFavorite', () => {
    it('removes a like swipe and returns removed count', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      prisma.matchSwipe.findUnique.mockResolvedValue({ direction: 'PASS' });
      prisma.matchSwipe.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeFavorite('a', 'b');
      expect(result).toEqual({ ok: true, removed: 1 });
    });

    it('throws favorite_not_found when like swipe does not exist', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      prisma.matchSwipe.findUnique.mockResolvedValue(null);
      prisma.matchSwipe.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeFavorite('a', 'b')).rejects.toMatchObject({
        message: 'favorite_not_found',
      });
    });

    it('throws favorite_is_match when partner already liked back', async () => {
      const service = new SwipeService(prisma, eventLogger as any);
      prisma.matchSwipe.findUnique.mockResolvedValue({ direction: 'LIKE' });

      await expect(service.removeFavorite('a', 'b')).rejects.toMatchObject({
        message: 'favorite_is_match',
      });
      expect(prisma.matchSwipe.deleteMany).not.toHaveBeenCalled();
    });
  });
});
