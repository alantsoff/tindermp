import { FeedService } from './feed.service';

const feedRowP1 = {
  id: 'p1',
  role: 'SELLER',
  roleCustom: null,
  displayName: 'Марина',
  headline: 'Ищу команду',
  bio: null,
  experience: 1,
  city: null,
  birthDate: null,
  zodiacSign: null,
  workFormats: [] as string[],
  marketplaces: [] as string[],
  marketplacesCustom: null,
  niches: ['wb'],
  skills: ['ads'],
  tools: [] as string[],
  priceMin: null,
  priceMax: null,
  currency: 'RUB',
  avatarUrl: null,
  portfolioUrl: null,
  telegramContact: '@marina',
  isActive: true,
  photos: [] as { id: string; url: string; order: number }[],
  quadrant: 'SLEEPING' as const,
  activityScore: 0,
  lastActiveAt: new Date('2024-06-01T12:00:00.000Z'),
  incomingSuperLike: false,
  score: 1,
};

describe('FeedService', () => {
  const prisma = {
    matchSettings: { findUnique: jest.fn() },
    matchProfilePhoto: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as any;
  const profileService = {
    requireProfileById: jest.fn(),
  } as any;

  beforeEach(() => {
    profileService.requireProfileById.mockResolvedValue({
      id: 'me',
      role: 'SELLER',
      niches: ['wb'],
      workFormats: [],
      marketplaces: [],
      city: null,
    });
    prisma.matchSettings.findUnique.mockResolvedValue({
      interestedRoles: ['SELLER'],
      interestedNiches: ['wb'],
    });
    prisma.$queryRaw.mockResolvedValue([feedRowP1]);
    prisma.matchProfilePhoto.findMany.mockResolvedValue([]);
  });

  it('returns feed page with hidden telegramContact', async () => {
    const service = new FeedService(prisma, profileService);
    const page = await service.getFeed('me', 20);

    expect(profileService.requireProfileById).toHaveBeenCalledWith('me');
    expect(page.items).toHaveLength(1);
    expect(page.items[0].telegramContact).toBeNull();
    expect(page.items[0].roleLabel).toBe('SELLER');
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  it('sets hasMore and nextOffset on a full page', async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({
      ...feedRowP1,
      id: `p${i + 1}`,
    }));
    prisma.$queryRaw.mockResolvedValueOnce(full);
    const service = new FeedService(prisma, profileService);
    const page = await service.getFeed('me', 20, 0);

    expect(page.items).toHaveLength(20);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(20);
  });

  it('returns no items when there is no feed after offset', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const service = new FeedService(prisma, profileService);
    const page = await service.getFeed('me', 20, 40);

    expect(page.items).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });
});
