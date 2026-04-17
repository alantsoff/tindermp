import { FeedService } from './feed.service';

describe('FeedService', () => {
  const prisma = {
    matchSettings: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  } as any;
  const profileService = {
    requireProfileById: jest.fn(),
  } as any;

  beforeEach(() => {
    profileService.requireProfileById.mockResolvedValue({ id: 'me' });
    prisma.matchSettings.findUnique.mockResolvedValue({
      interestedRoles: ['SELLER'],
      interestedNiches: ['wb'],
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        role: 'SELLER',
        roleCustom: null,
        displayName: 'Марина',
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
        telegramContact: '@marina',
        isActive: true,
      },
    ]);
  });

  it('returns feed rows with hidden telegramContact', async () => {
    const service = new FeedService(prisma, profileService);
    const rows = await service.getFeed('me', 20);

    expect(profileService.requireProfileById).toHaveBeenCalledWith('me');
    expect(rows).toHaveLength(1);
    expect(rows[0].telegramContact).toBeNull();
    expect(rows[0].roleLabel).toBe('SELLER');
  });
});
