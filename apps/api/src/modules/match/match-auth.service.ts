import {
  Injectable,
  Logger,
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

const LOCAL_DEV_INIT_DATA = 'local-dev-auth';

const LOCAL_DEMO_PROFILES = [
  {
    telegramId: 'match-dev-demo-001',
    telegramUsername: 'demo_seller',
    displayName: 'Марина Селлер',
    role: 'SELLER',
    headline: 'Ищу команду под рост на WB',
    bio: 'Запускаю новые SKU, ищу менеджера и дизайнера на постоянку.',
    city: 'Москва',
    workFormats: ['REMOTE', 'HYBRID'],
    marketplaces: ['WB', 'OZON'],
    niches: ['одежда', 'дом'],
    skills: ['юнит-экономика', 'запуск sku'],
    experience: 6,
    priceMin: 2500,
    priceMax: 6000,
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1200&auto=format&fit=crop',
  },
  {
    telegramId: 'match-dev-demo-002',
    telegramUsername: 'demo_designer',
    displayName: 'Екатерина Дизайнер',
    role: 'DESIGNER',
    headline: 'Карточки и инфографика под CTR',
    bio: 'Делаю визуал карточек, A/B гипотезы и ленту креативов.',
    city: 'Санкт-Петербург',
    workFormats: ['REMOTE'],
    marketplaces: ['WB', 'OZON'],
    niches: ['косметика', 'товары для дома'],
    skills: ['figma', 'инфографика', 'ab-тесты'],
    experience: 4,
    priceMin: 1500,
    priceMax: 3500,
    avatarUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1200&auto=format&fit=crop',
  },
  {
    telegramId: 'match-dev-demo-003',
    telegramUsername: 'demo_ads',
    displayName: 'Илья Трафик',
    role: 'AD_BUYER',
    headline: 'Трафик из Telegram Ads и блогеров',
    bio: 'Веду закуп и оптимизацию, нацелен на ROMI и масштаб.',
    city: 'Казань',
    workFormats: ['REMOTE', 'OFFICE'],
    marketplaces: ['WB', 'OZON', 'YANDEX_MARKET'],
    niches: ['электроника'],
    skills: ['telegram ads', 'медиаплан', 'аналитика'],
    experience: 8,
    priceMin: 3000,
    priceMax: 7000,
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=1200&auto=format&fit=crop',
  },
] as const;

@Injectable()
export class MatchAuthService {
  private readonly logger = new Logger(MatchAuthService.name);

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

  private isLocalAuthBypassEnabled(): boolean {
    const value = process.env.MATCH_DEV_AUTH_BYPASS?.trim().toLowerCase();
    const enabled = value === '1' || value === 'true' || value === 'yes';
    if (!enabled) return false;

    const isProduction =
      process.env.NODE_ENV?.trim().toLowerCase() === 'production';
    if (!isProduction) return true;

    const allowInProduction =
      process.env.MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION?.trim().toLowerCase();
    return (
      allowInProduction === '1' ||
      allowInProduction === 'true' ||
      allowInProduction === 'yes'
    );
  }

  private shouldSeedLocalDemoProfiles(): boolean {
    const isProduction =
      process.env.NODE_ENV?.trim().toLowerCase() === 'production';
    if (isProduction) return false;

    const explicit = process.env.MATCH_DEV_SEED_DEMO?.trim().toLowerCase();
    if (explicit) {
      return explicit === '1' || explicit === 'true' || explicit === 'yes';
    }
    return true;
  }

  private async authenticateLocalDev() {
    const telegramId =
      process.env.MATCH_DEV_TELEGRAM_ID?.trim() ||
      'match-dev-local-telegram-id';
    const telegramUsername =
      process.env.MATCH_DEV_TELEGRAM_USERNAME?.trim() || 'match_dev_local';
    const displayName =
      process.env.MATCH_DEV_DISPLAY_NAME?.trim() || 'Match Local Dev';

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername,
        displayName,
      },
      create: {
        telegramId,
        telegramUsername,
        displayName,
      },
      select: { id: true },
    });

    // Профиль через dev-bypass создаётся ТОЛЬКО вне production.
    // Если prod-оператор намеренно или по ошибке включил
    // MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION, мы всё равно не создаём dev-профиль
    // и возвращаем profileId=null, чтобы пользователь прошёл обычный
    // invite-only поток через /m/invite → /m/onboarding. Это убирает
    // последний путь обхода инвайта через dev-режим.
    const isProduction =
      process.env.NODE_ENV?.trim().toLowerCase() === 'production';
    const profile = isProduction
      ? null
      : await this.prisma.matchProfile.upsert({
          where: { userId: user.id },
          update: {
            role: 'SELLER',
            displayName,
            headline: 'Локальный тестовый аккаунт',
            bio: 'Профиль для локальной отладки mini-app.',
            city: 'Москва',
            workFormats: ['REMOTE'],
            marketplaces: ['WB'],
            niches: ['demo'],
            skills: ['demo'],
            isActive: true,
          },
          create: {
            userId: user.id,
            role: 'SELLER',
            displayName,
            headline: 'Локальный тестовый аккаунт',
            bio: 'Профиль для локальной отладки mini-app.',
            city: 'Москва',
            workFormats: ['REMOTE'],
            marketplaces: ['WB'],
            niches: ['demo'],
            skills: ['demo'],
            isActive: true,
          },
          select: { id: true },
        });

    if (isProduction) {
      this.logger.warn(
        `dev-bypass auth used in production for telegramId=${telegramId} — profile creation skipped, user must go through invite flow`,
      );
    }

    if (this.shouldSeedLocalDemoProfiles()) {
      for (const demo of LOCAL_DEMO_PROFILES) {
        const demoUser = await this.prisma.user.upsert({
          where: { telegramId: demo.telegramId },
          update: {
            telegramUsername: demo.telegramUsername,
            displayName: demo.displayName,
          },
          create: {
            telegramId: demo.telegramId,
            telegramUsername: demo.telegramUsername,
            displayName: demo.displayName,
          },
          select: { id: true },
        });

        await this.prisma.matchProfile.upsert({
          where: { userId: demoUser.id },
          update: {
            role: demo.role,
            displayName: demo.displayName,
            headline: demo.headline,
            bio: demo.bio,
            city: demo.city,
            workFormats: [...demo.workFormats],
            marketplaces: [...demo.marketplaces],
            niches: [...demo.niches],
            skills: [...demo.skills],
            priceMin: demo.priceMin,
            priceMax: demo.priceMax,
            avatarUrl: demo.avatarUrl,
            isActive: true,
            shadowBanned: false,
            bannedAt: null,
            pausedUntil: null,
          },
          create: {
            userId: demoUser.id,
            role: demo.role,
            displayName: demo.displayName,
            headline: demo.headline,
            bio: demo.bio,
            city: demo.city,
            workFormats: [...demo.workFormats],
            marketplaces: [...demo.marketplaces],
            niches: [...demo.niches],
            skills: [...demo.skills],
            priceMin: demo.priceMin,
            priceMax: demo.priceMax,
            avatarUrl: demo.avatarUrl,
            isActive: true,
          },
        });
      }
    }

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

  async authenticateByInitData(
    initDataRaw: string,
  ): Promise<{ token: string; profileId: string | null }> {
    const initData = initDataRaw.trim();
    const isLocalBypass = this.isLocalAuthBypassEnabled();
    if (!initData) {
      if (isLocalBypass) {
        return this.authenticateLocalDev();
      }
      throw new UnauthorizedException('initData required');
    }

    if (isLocalBypass && initData === LOCAL_DEV_INIT_DATA) {
      return this.authenticateLocalDev();
    }

    // 15 min TTL — компромисс между рекомендацией Telegram (5 мин) и UX:
    // онбординг с фото и длинными списками навыков реально занимает 5+ минут,
    // а Telegram WebView не всегда перевыпускает initData при повторном
    // открытии. 900 секунд всё ещё сильно ограничивают окно переиспользования
    // утёкшей initData (раньше было 24 часа).
    validate(initData, this.getMatchBotToken(), { expiresIn: 900 });
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
