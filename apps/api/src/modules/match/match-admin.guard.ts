import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventLoggerService } from './event-logger.service';
import { MatchAuthGuard } from './match-auth.guard';
import { MatchAuthService } from './match-auth.service';
import { SwipeService } from './swipe.service';
import { toAdminEmailByTelegramId } from './match.utils';

@Injectable()
export class MatchAdminGuard extends MatchAuthGuard implements CanActivate {
  constructor(
    authService: MatchAuthService,
    private readonly prismaService: PrismaService,
    eventLogger: EventLoggerService,
    swipeService: SwipeService,
  ) {
    super(authService, prismaService, eventLogger, swipeService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<{
      matchUser?: { userId: string };
    }>();
    const userId = request.matchUser?.userId;
    if (!userId) throw new ForbiddenException('admin_only');

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (!user?.telegramId) throw new ForbiddenException('admin_only');

    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const email = toAdminEmailByTelegramId(user.telegramId).toLowerCase();
    if (!adminEmails.includes(email)) {
      throw new ForbiddenException('admin_only');
    }
    return true;
  }
}
