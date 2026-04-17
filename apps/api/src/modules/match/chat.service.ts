import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.ensurePairAccess(pairId, profileId);
    return this.prisma.matchMessage.create({
      data: {
        pairId,
        senderProfileId: profileId,
        body: body.trim(),
      },
    });
  }
}
