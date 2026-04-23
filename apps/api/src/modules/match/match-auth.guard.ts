import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventLoggerService } from './event-logger.service';
import { MatchAuthService } from './match-auth.service';
import { SwipeService } from './swipe.service';

@Injectable()
export class MatchAuthGuard implements CanActivate {
  private readonly logger = new Logger(MatchAuthGuard.name);

  constructor(
    private readonly authService: MatchAuthService,
    private readonly prisma: PrismaService,
    private readonly eventLogger: EventLoggerService,
    private readonly swipeService: SwipeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      matchUser?: { userId: string; profileId: string | null };
    }>();
    const authHeader = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Token required');
    }

    const payload = await this.authService.verifyMatchToken(token);
    let profileId = payload.pid;
    if (!profileId) {
      const profile = await this.prisma.matchProfile.findUnique({
        where: { userId: payload.uid },
        select: { id: true },
      });
      profileId = profile?.id ?? null;
    }
    if (profileId) {
      const profile = await this.prisma.matchProfile.findUnique({
        where: { id: profileId },
        select: { bannedAt: true, lastActiveAt: true },
      });
      if (profile?.bannedAt) {
        throw new ForbiddenException('profile_banned');
      }
      if (profile?.lastActiveAt) {
        // Fire-and-forget: в 99% случаев maybeAutoCatchupReset отработает за
        // миллисекунды (ранний return, пользователь был активен недавно), но
        // в редкой ситуации «вернулся через 60+ дней» функция чистит свайпы
        // через deleteMany — это могли быть секунды. Нет причин держать
        // guard/auth-запрос ради побочного эффекта; клиент увидит сброшенную
        // ленту на следующем refetch.
        void this.swipeService
          .maybeAutoCatchupReset(profileId, profile.lastActiveAt)
          .catch((error) => {
            this.logger.warn(
              `maybeAutoCatchupReset failed for profile ${profileId}: ${String(error)}`,
            );
          });
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const updated = await this.prisma.matchProfile.updateMany({
        where: { id: profileId, lastActiveAt: { lt: fiveMinutesAgo } },
        data: { lastActiveAt: new Date() },
      });
      if (updated.count > 0) {
        void this.eventLogger.log({
          profileId,
          userId: payload.uid,
          type: 'MINIAPP_OPENED',
        });
      }
    }
    request.matchUser = { userId: payload.uid, profileId };
    return true;
  }
}
