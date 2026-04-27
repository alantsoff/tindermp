import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sendTelegramMessage } from '../telegram/telegram-send';
import { EventLoggerService } from './event-logger.service';

export type NotificationKind =
  | 'match'
  | 'incoming_like'
  | 'message'
  | 'invite_redeemed'
  | 'digest'
  | 'pending_likes'
  | 'auto_reset';

// Per-kind throttle window. NotificationService подавляет повторные отправки
// одного kind для одного профиля внутри окна. 0 — без троттла (обычно потому
// что cron уже сам гейтит, либо событие редкое).
//   message — 30 минут на пару (throttleKey=pairId), чтобы при активной
//             переписке не уходило 50 push'ей подряд
//   incoming_like — 6 часов на профиль, чтобы лайк-фарминг не превращался в спам
const THROTTLE_SECONDS: Record<NotificationKind, number> = {
  match: 0,
  incoming_like: 6 * 3600,
  message: 30 * 60,
  invite_redeemed: 0,
  digest: 0,
  pending_likes: 0,
  auto_reset: 0,
};

export type NotificationOptions = {
  text: string;
  // Суффикс к MATCH_MINIAPP_URL для deep-link (например, `?pair=xxx`).
  webAppPathSuffix?: string;
  buttonText?: string;
  // Ключ троттл-окна. Для message: pairId. Если не задан — троттл по
  // (profileId, kind) без дополнительной разбивки.
  throttleKey?: string;
  // Доп. поля для аудита в payload NOTIFICATION_SENT.
  meta?: Record<string, unknown>;
};

export type NotificationResultReason =
  | 'sent'
  | 'profile_not_found'
  | 'no_telegram_id'
  | 'no_token'
  | 'no_miniapp_url'
  | 'master_muted'
  | 'kind_disabled'
  | 'throttled'
  | 'send_failed';

export type NotificationResult = {
  sent: boolean;
  reason: NotificationResultReason;
};

type SettingsFlags = {
  notifyMatch: boolean;
  notifyIncomingLike: boolean;
  notifyMessage: boolean;
  notifyInvite: boolean;
  notifyDigest: boolean;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  private getBotToken(): string | null {
    return (
      process.env.MATCH_BOT_TOKEN?.trim() ||
      process.env.REALSKLADCHINA_BOT_TOKEN?.trim() ||
      process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      null
    );
  }

  private getMiniAppUrl(): string | null {
    return process.env.MATCH_MINIAPP_URL?.trim() ?? null;
  }

  private isKindEnabled(
    settings: SettingsFlags | null,
    kind: NotificationKind,
  ): boolean {
    // Settings row отсутствует — считаем все per-kind флаги дефолтными (true).
    if (!settings) return true;
    switch (kind) {
      case 'match':
        return settings.notifyMatch;
      case 'incoming_like':
      case 'pending_likes':
        return settings.notifyIncomingLike;
      case 'message':
        return settings.notifyMessage;
      case 'invite_redeemed':
        return settings.notifyInvite;
      case 'digest':
        return settings.notifyDigest;
      case 'auto_reset':
        // Системные «лента обновлена» — без отдельного opt-out, master mute
        // уже даёт глобальное «выключи всё».
        return true;
    }
  }

  private async isThrottled(
    profileId: string,
    kind: NotificationKind,
    throttleKey: string | undefined,
  ): Promise<boolean> {
    const seconds = THROTTLE_SECONDS[kind];
    if (seconds <= 0) return false;
    const since = new Date(Date.now() - seconds * 1000);
    // JSON-фильтр Prisma по path работает на Postgres JSONB. Чтобы
    // не зависеть от типизации `JsonNullableFilter`, собираем условия
    // через AND с явным `path`/`equals`.
    const recent = await this.prisma.matchEventLog.findFirst({
      where: {
        profileId,
        type: 'NOTIFICATION_SENT',
        createdAt: { gte: since },
        AND: [
          { payload: { path: ['kind'], equals: kind } },
          ...(throttleKey !== undefined
            ? [{ payload: { path: ['throttleKey'], equals: throttleKey } }]
            : []),
        ],
      },
      select: { id: true },
    });
    return Boolean(recent);
  }

  async send(
    profileId: string,
    kind: NotificationKind,
    options: NotificationOptions,
  ): Promise<NotificationResult> {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        notificationsMuted: true,
        user: { select: { telegramId: true } },
        settings: {
          select: {
            notifyMatch: true,
            notifyIncomingLike: true,
            notifyMessage: true,
            notifyInvite: true,
            notifyDigest: true,
          },
        },
      },
    });
    if (!profile) return { sent: false, reason: 'profile_not_found' };

    const telegramId = profile.user?.telegramId?.trim() ?? null;
    if (!telegramId) return { sent: false, reason: 'no_telegram_id' };

    const token = this.getBotToken();
    if (!token) return { sent: false, reason: 'no_token' };
    const miniAppUrl = this.getMiniAppUrl();
    if (!miniAppUrl) return { sent: false, reason: 'no_miniapp_url' };

    if (profile.notificationsMuted) {
      void this.eventLogger.log({
        profileId,
        type: 'NOTIFICATION_THROTTLED',
        payload: {
          kind,
          reason: 'master_muted',
          throttleKey: options.throttleKey ?? null,
        },
      });
      return { sent: false, reason: 'master_muted' };
    }

    if (!this.isKindEnabled(profile.settings ?? null, kind)) {
      void this.eventLogger.log({
        profileId,
        type: 'NOTIFICATION_THROTTLED',
        payload: {
          kind,
          reason: 'kind_disabled',
          throttleKey: options.throttleKey ?? null,
        },
      });
      return { sent: false, reason: 'kind_disabled' };
    }

    if (await this.isThrottled(profileId, kind, options.throttleKey)) {
      void this.eventLogger.log({
        profileId,
        type: 'NOTIFICATION_THROTTLED',
        payload: {
          kind,
          reason: 'rate_limited',
          throttleKey: options.throttleKey ?? null,
        },
      });
      return { sent: false, reason: 'throttled' };
    }

    const url = options.webAppPathSuffix
      ? `${miniAppUrl}${options.webAppPathSuffix}`
      : miniAppUrl;
    const result = await sendTelegramMessage(token, telegramId, options.text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: options.buttonText ?? 'Открыть Match',
              web_app: { url },
            },
          ],
        ],
      },
    });

    if (!result.ok) {
      this.logger.warn(
        `notification ${kind} failed for profile=${profileId}: ${result.error ?? 'unknown'}`,
      );
      return { sent: false, reason: 'send_failed' };
    }

    void this.eventLogger.log({
      profileId,
      type: 'NOTIFICATION_SENT',
      payload: {
        kind,
        throttleKey: options.throttleKey ?? null,
        ...(options.meta ?? {}),
      },
    });
    return { sent: true, reason: 'sent' };
  }
}
