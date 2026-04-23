import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { toAdminEmailByTelegramId } from '../match/match.utils';

type AdminJwtPayload = {
  typ: 'admin-web';
  uid: string;
  tid: string;
};

@Injectable()
export class AdminWebAuthService {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private getJwtSecret(): string {
    const secret = process.env.MATCH_JWT_SECRET?.trim();
    if (!secret)
      throw new ServiceUnavailableException(
        'MATCH_JWT_SECRET is not configured',
      );
    return secret;
  }

  private getAdminPasswordHash(): string {
    const hash = process.env.ADMIN_WEB_PASSWORD_HASH?.trim();
    if (!hash)
      throw new ServiceUnavailableException(
        'ADMIN_WEB_PASSWORD_HASH is not configured',
      );
    return hash;
  }

  private isRateLimited(telegramId: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const attempts = (this.attempts.get(telegramId) ?? []).filter(
      (value) => now - value < windowMs,
    );
    this.attempts.set(telegramId, attempts);
    return attempts.length >= 3;
  }

  private markFailedAttempt(telegramId: string): void {
    const attempts = this.attempts.get(telegramId) ?? [];
    attempts.push(Date.now());
    this.attempts.set(telegramId, attempts);
  }

  private clearAttempts(telegramId: string): void {
    this.attempts.delete(telegramId);
  }

  private isAdminTelegramId(telegramId: string): boolean {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const candidate = toAdminEmailByTelegramId(telegramId).toLowerCase();
    return adminEmails.includes(candidate);
  }

  async login(telegramIdRaw: string, passwordRaw: string) {
    const telegramId = telegramIdRaw.trim();
    const password = passwordRaw.trim();
    if (this.isRateLimited(telegramId)) {
      throw new UnauthorizedException('admin_rate_limited');
    }
    const ok = await bcrypt.compare(password, this.getAdminPasswordHash());
    if (!ok) {
      this.markFailedAttempt(telegramId);
      throw new UnauthorizedException('invalid_admin_credentials');
    }
    this.clearAttempts(telegramId);
    if (!this.isAdminTelegramId(telegramId)) {
      throw new ForbiddenException('admin_only');
    }
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true, telegramId: true },
    });
    if (!user) {
      throw new UnauthorizedException('admin_user_not_found');
    }

    const payload: AdminJwtPayload = {
      typ: 'admin-web',
      uid: user.id,
      tid: user.telegramId,
    };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: '30d',
    });
    return { token };
  }

  async verify(token: string): Promise<AdminJwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AdminJwtPayload>(
        token,
        {
          secret: this.getJwtSecret(),
        },
      );
      if (payload.typ !== 'admin-web' || !payload.uid || !payload.tid) {
        throw new UnauthorizedException('invalid_admin_token');
      }
      if (!this.isAdminTelegramId(payload.tid)) {
        throw new ForbiddenException('admin_only');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('invalid_admin_token');
    }
  }
}
