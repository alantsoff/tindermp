import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sendTelegramMessage } from '../telegram/telegram-send';

function normalizePairIds(
  a: string,
  b: string,
): { profileAId: string; profileBId: string } {
  return a < b
    ? { profileAId: a, profileBId: b }
    : { profileAId: b, profileBId: a };
}

@Injectable()
export class SwipeService {
  constructor(private readonly prisma: PrismaService) {}

  private async notifyNewMatch(
    pairId: string,
    left: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    },
    right: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    },
  ): Promise<void> {
    const token = process.env.MATCH_BOT_TOKEN?.trim();
    const miniAppUrl = process.env.MATCH_MINIAPP_URL?.trim();
    if (!token || !miniAppUrl) return;

    const send = async (item: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    }) => {
      await sendTelegramMessage(
        token,
        item.telegramId,
        `🔥 У вас новый матч с ${item.partnerName}!\n${item.partnerHeadline ?? ''}`.trim(),
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Открыть чат',
                  web_app: { url: `${miniAppUrl}?pair=${pairId}` },
                },
              ],
            ],
          },
        },
      );
    };

    await Promise.all([send(left), send(right)]);
  }

  async swipe(
    profileId: string,
    toProfileId: string,
    direction: 'LIKE' | 'PASS',
  ) {
    if (profileId === toProfileId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const [fromProfile, toProfile] = await Promise.all([
      this.prisma.matchProfile.findUnique({
        where: { id: profileId },
        include: { user: { select: { telegramId: true } } },
      }),
      this.prisma.matchProfile.findUnique({
        where: { id: toProfileId },
        include: { user: { select: { telegramId: true } } },
      }),
    ]);
    if (!fromProfile) throw new NotFoundException('Profile not found');
    if (!toProfile) throw new NotFoundException('Target profile not found');

    await this.prisma.matchSwipe.upsert({
      where: {
        fromProfileId_toProfileId: {
          fromProfileId: profileId,
          toProfileId,
        },
      },
      update: {
        direction,
        createdAt: new Date(),
      },
      create: {
        fromProfileId: profileId,
        toProfileId,
        direction,
      },
    });

    if (direction !== 'LIKE') {
      return { matched: false as const };
    }

    const mirror = await this.prisma.matchSwipe.findUnique({
      where: {
        fromProfileId_toProfileId: {
          fromProfileId: toProfileId,
          toProfileId: profileId,
        },
      },
      select: { direction: true },
    });
    if (!mirror || mirror.direction !== 'LIKE') {
      return { matched: false as const };
    }

    const pairKeys = normalizePairIds(profileId, toProfileId);
    const pair = await this.prisma.matchPair.upsert({
      where: { profileAId_profileBId: pairKeys },
      update: {},
      create: pairKeys,
    });

    await this.notifyNewMatch(
      pair.id,
      {
        telegramId: fromProfile.user.telegramId,
        partnerName: toProfile.displayName,
        partnerHeadline: toProfile.headline,
      },
      {
        telegramId: toProfile.user.telegramId,
        partnerName: fromProfile.displayName,
        partnerHeadline: fromProfile.headline,
      },
    );

    return {
      matched: true as const,
      pairId: pair.id,
      partner: {
        id: toProfile.id,
        displayName: toProfile.displayName,
        avatarUrl: toProfile.avatarUrl,
        role: toProfile.role,
        roleCustom: toProfile.roleCustom,
        telegramContact: toProfile.telegramContact,
      },
    };
  }

  async undoLastSwipe(profileId: string) {
    const lastSwipe = await this.prisma.matchSwipe.findFirst({
      where: { fromProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastSwipe) {
      return { undone: false as const };
    }
    await this.prisma.matchSwipe.delete({ where: { id: lastSwipe.id } });
    return {
      undone: true as const,
      toProfileId: lastSwipe.toProfileId,
      direction: lastSwipe.direction,
    };
  }

  async getMatches(profileId: string) {
    const pairs = await this.prisma.matchPair.findMany({
      where: {
        OR: [{ profileAId: profileId }, { profileBId: profileId }],
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pairs.length === 0) return [];

    const partnerIds = pairs.map((pair) =>
      pair.profileAId === profileId ? pair.profileBId : pair.profileAId,
    );
    const partners = await this.prisma.matchProfile.findMany({
      where: { id: { in: partnerIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        roleCustom: true,
      },
    });
    const partnerById = new Map(
      partners.map((partner) => [partner.id, partner]),
    );

    return pairs.map((pair) => {
      const partnerId =
        pair.profileAId === profileId ? pair.profileBId : pair.profileAId;
      return {
        id: pair.id,
        createdAt: pair.createdAt,
        partner: partnerById.get(partnerId) ?? null,
        lastMessage: pair.messages[0] ?? null,
      };
    });
  }
}
