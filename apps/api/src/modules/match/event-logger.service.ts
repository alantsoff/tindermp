import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MatchEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type EventLogInput = {
  profileId?: string | null;
  userId?: string | null;
  type: MatchEventType;
  targetProfileId?: string | null;
  payload?: Prisma.JsonValue;
};

@Injectable()
export class EventLoggerService {
  private readonly logger = new Logger(EventLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Если вызывается из `prisma.$transaction`, передайте `tx`, иначе вставка
   * в `MatchEventLog` идёт отдельным подключением и не видит незакоммиченный
   * `MatchProfile` → FK `MatchEventLog_profileId_fkey`.
   */
  async log(
    input: EventLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await db.matchEventLog.create({
        data: {
          profileId: input.profileId ?? null,
          userId: input.userId ?? null,
          type: input.type,
          targetProfileId: input.targetProfileId ?? null,
          payload:
            input.payload === undefined
              ? undefined
              : input.payload === null
                ? Prisma.JsonNull
                : (input.payload as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write event ${input.type}: ${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }
}
