import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchAuthService } from './match-auth.service';

@Injectable()
export class MatchAuthGuard implements CanActivate {
  constructor(
    private readonly authService: MatchAuthService,
    private readonly prisma: PrismaService,
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
    request.matchUser = { userId: payload.uid, profileId };
    return true;
  }
}
