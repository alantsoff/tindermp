import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Режим логирования Prisma-запросов:
 *   'off'   — тихо, минимум оверхеда (по умолчанию в prod).
 *   'lite'  — агрегируем длительность запросов (count + max) без разбора SQL;
 *             полезно для /health-метрик без regex-оверхеда на hot path.
 *   'full'  — Prisma сама выводит все запросы через 'stdout' (только dev/отладка).
 *
 * Управление через PRISMA_LOG=off|lite|full.
 */
type PrismaLogMode = 'off' | 'lite' | 'full';

function resolveLogMode(): PrismaLogMode {
  const raw = process.env.PRISMA_LOG?.toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'lite') return 'lite';
  if (raw === 'full' || raw === '1') return 'full';
  // Дефолт: в dev — lite (удобно видеть пики в /health), в prod — off.
  return process.env.NODE_ENV === 'production' ? 'off' : 'lite';
}

export type PrismaLiteMetricsSnapshot = {
  queryCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Лёгкая агрегированная статистика (режим 'lite'). Не пытаемся хранить
   * ничего per-model, чтобы не тратить CPU на regex в hot path — только
   * counters. Нужен тонкий разрез по моделям? Включить PRISMA_LOG=full
   * локально или поверх class'а навесить полноценный store.
   */
  private static liteMetrics: PrismaLiteMetricsSnapshot = {
    queryCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };

  static snapshotMetrics(): PrismaLiteMetricsSnapshot {
    return { ...PrismaService.liteMetrics };
  }

  static resetMetrics(): void {
    PrismaService.liteMetrics = {
      queryCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
  }

  constructor() {
    const mode = resolveLogMode();
    const log: Prisma.LogDefinition[] = (() => {
      if (mode === 'full') {
        return [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ];
      }
      if (mode === 'lite') {
        // Эмитим только события, агрегируем руками.
        return [{ emit: 'event', level: 'query' }];
      }
      return [];
    })();

    super({ log });

    if (mode === 'lite') {
      this.$on('query' as never, (event: { duration?: number }) => {
        const duration = Number(event.duration ?? 0);
        const m = PrismaService.liteMetrics;
        m.queryCount += 1;
        m.totalDurationMs += duration;
        if (duration > m.maxDurationMs) m.maxDurationMs = duration;
      });
    }

    if (mode !== 'off') {
      this.logger.log(`Prisma query logging mode: ${mode}`);
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
