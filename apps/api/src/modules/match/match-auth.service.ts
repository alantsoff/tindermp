import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse, validate } from '@tma.js/init-data-node';
import { PrismaService } from '../../prisma/prisma.service';

export type MatchJwtPayload = {
  uid: string;
  pid: string | null;
};

@Injectable()
export class MatchAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private getMatchJwtSecret(): string {
    const secret = process.env.MATCH_JWT_SECRET?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'MATCH_JWT_SECRET is not configured',
      );
    }
    return secret;
  }

  private getMatchBotToken(): string {
    const token = process.env.MATCH_BOT_TOKEN?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'MATCH_BOT_TOKEN is not configured',
      );
    }
    return token;
  }

  async authenticateByInitData(
    initDataRaw: string,
  ): Promise<{ token: string; profileId: string | null }> {
    const initData = initDataRaw.trim();
    if (!initData) {
      throw new UnauthorizedException('initData required');
    }

    validate(initData, this.getMatchBotToken(), { expiresIn: 24 * 3600 });
    const parsed = parse(initData);
    if (!parsed.user?.id) {
      throw new UnauthorizedException('Telegram user is missing in initData');
    }

    const telegramId = String(parsed.user.id);
    const user = await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername: parsed.user.username ?? null,
        displayName:
          [parsed.user.first_name, parsed.user.last_name]
            .filter(Boolean)
            .join(' ') || null,
      },
      create: {
        telegramId,
        telegramUsername: parsed.user.username ?? null,
        displayName:
          [parsed.user.first_name, parsed.user.last_name]
            .filter(Boolean)
            .join(' ') || null,
      },
      select: { id: true },
    });

    const profile = await this.prisma.matchProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    const payload: MatchJwtPayload = { uid: user.id, pid: profile?.id ?? null };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.getMatchJwtSecret(),
      expiresIn: '30d',
    });

    return {
      token,
      profileId: profile?.id ?? null,
    };
  }

  async verifyMatchToken(token: string): Promise<MatchJwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<MatchJwtPayload>(
        token,
        {
          secret: this.getMatchJwtSecret(),
        },
      );
      if (!payload?.uid) {
        throw new UnauthorizedException('Invalid token payload');
      }
      return { uid: payload.uid, pid: payload.pid ?? null };
    } catch {
      throw new UnauthorizedException('Invalid or expired match token');
    }
  }
}
