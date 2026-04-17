import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { MatchAuthService } from './match-auth.service';

jest.mock('@tma.js/init-data-node', () => ({
  validate: jest.fn(),
  parse: jest.fn(() => ({
    user: {
      id: 123,
      first_name: 'Ivan',
      last_name: 'Petrov',
      username: 'ivan',
    },
  })),
}));

describe('MatchAuthService', () => {
  const prisma = {
    user: { upsert: jest.fn() },
    matchProfile: { findUnique: jest.fn() },
  } as any;
  const jwt = { signAsync: jest.fn() } as unknown as JwtService;

  beforeEach(() => {
    process.env.MATCH_BOT_TOKEN = 'test-bot-token';
    process.env.MATCH_JWT_SECRET = 'test-jwt-secret';
    prisma.user.upsert.mockResolvedValue({ id: 'u1' });
    prisma.matchProfile.findUnique.mockResolvedValue({ id: 'p1' });
    (jwt.signAsync as jest.Mock).mockResolvedValue('jwt-token');
  });

  it('authenticates initData and returns token + profileId', async () => {
    const service = new MatchAuthService(prisma, jwt);
    const result = await service.authenticateByInitData('rawInitData');

    expect(result).toEqual({ token: 'jwt-token', profileId: 'p1' });
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalled();
  });

  it('throws on empty initData', async () => {
    const service = new MatchAuthService(prisma, jwt);
    await expect(service.authenticateByInitData('   ')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
