import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventLoggerService } from './event-logger.service';
import { sendTelegramMessage } from '../telegram/telegram-send';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  private async notifyIncomingMessage(params: {
    recipientTelegramId?: string | null;
    senderName: string;
    pairId: string;
    body: string;
  }): Promise<void> {
    const token = process.env.MATCH_BOT_TOKEN?.trim();
    const miniAppUrl = process.env.MATCH_MINIAPP_URL?.trim();
    const recipientTelegramId = params.recipientTelegramId?.trim();
    if (!token || !miniAppUrl || !recipientTelegramId) return;

    const preview =
      params.body.length > 140
        ? `${params.body.slice(0, 137)}...`
        : params.body;
    const result = await sendTelegramMessage(
      token,
      recipientTelegramId,
      `💬 Новое сообщение в Match\nОт: ${params.senderName}\n\n${preview}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Открыть чат',
                web_app: { url: `${miniAppUrl}?pair=${params.pairId}` },
              },
            ],
          ],
        },
      },
    );
    if (!result.ok) {
      this.logger.warn(
        `Failed to notify about new message for ${recipientTelegramId}: ${result.error ?? 'unknown'}`,
      );
    }
  }

  private async ensurePairAccess(pairId: string, profileId: string) {
    const pair = await this.prisma.matchPair.findUnique({
      where: { id: pairId },
    });
    if (!pair) {
      throw new NotFoundException('Pair not found');
    }
    if (pair.profileAId !== profileId && pair.profileBId !== profileId) {
      throw new ForbiddenException('No access to this pair');
    }
    return pair;
  }

  async getMessages(pairId: string, profileId: string) {
    await this.ensurePairAccess(pairId, profileId);
    return this.prisma.matchMessage.findMany({
      where: { pairId },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
  }

  async sendMessage(pairId: string, profileId: string, body: string) {
    const pair = await this.ensurePairAccess(pairId, profileId);
    const text = body.trim();
    if (!text) throw new BadRequestException('message_empty');
    const message = await this.prisma.matchMessage.create({
      data: {
        pairId,
        senderProfileId: profileId,
        body: text,
      },
    });
    void this.eventLogger.log({
      profileId,
      type: 'MESSAGE_SENT',
      payload: { pairId, messageId: message.id },
    });

    const recipientProfileId =
      pair.profileAId === profileId ? pair.profileBId : pair.profileAId;
    const [sender, recipient] = await Promise.all([
      this.prisma.matchProfile.findUnique({
        where: { id: profileId },
        select: { displayName: true },
      }),
      this.prisma.matchProfile.findUnique({
        where: { id: recipientProfileId },
        select: { user: { select: { telegramId: true } } },
      }),
    ]);
    await this.notifyIncomingMessage({
      recipientTelegramId: recipient?.user.telegramId,
      senderName: sender?.displayName ?? 'Собеседник',
      pairId,
      body: text,
    });
    return message;
  }

  async revealContact(pairId: string, profileId: string) {
    const pair = await this.ensurePairAccess(pairId, profileId);
    const partnerId =
      pair.profileAId === profileId ? pair.profileBId : pair.profileAId;
    const partner = await this.prisma.matchProfile.findUnique({
      where: { id: partnerId },
      select: { id: true, telegramContact: true, displayName: true },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    void this.eventLogger.log({
      profileId,
      targetProfileId: partnerId,
      type: 'CONTACT_REVEALED',
      payload: { pairId },
    });
    return partner;
  }

  async getPartnerProfile(pairId: string, profileId: string) {
    const pair = await this.ensurePairAccess(pairId, profileId);
    const partnerId =
      pair.profileAId === profileId ? pair.profileBId : pair.profileAId;
    const partner = await this.prisma.matchProfile.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        role: true,
        roleCustom: true,
        displayName: true,
        headline: true,
        bio: true,
        experience: true,
        city: true,
        birthDate: true,
        zodiacSign: true,
        workFormats: true,
        marketplaces: true,
        marketplacesCustom: true,
        niches: true,
        skills: true,
        tools: true,
        priceMin: true,
        priceMax: true,
        currency: true,
        avatarUrl: true,
        photos: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        portfolioUrl: true,
        telegramContact: true,
        isActive: true,
      },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    return {
      ...partner,
      // Не раскрываем Telegram-контакт в карточке мэтча — общение внутри Match;
      // отдельно есть revealContact, если сценарий «поделиться контактом» появится в UI.
      telegramContact: null,
      roleLabel:
        partner.role === 'CUSTOM'
          ? (partner.roleCustom ?? 'CUSTOM')
          : partner.role,
    };
  }
}
