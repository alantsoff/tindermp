import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { isInviteOnlyModeEnabled } from './modules/match/match.utils';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.MATCH_CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : process.env.NODE_ENV === 'development',
    credentials: true,
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression({ level: 6 }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const uploadsRoot =
    process.env.MATCH_UPLOADS_DIR?.trim() ||
    resolve(__dirname, '..', 'storage', 'match-media');
  await mkdir(join(uploadsRoot, 'photos'), { recursive: true });
  app.use('/match-media', express.static(uploadsRoot));
  await app.listen(process.env.PORT ?? 3001);

  // Стартовая диагностика invite-only и связанных bypass'ов — видно сразу
  // в логах API, в каком состоянии поднялся инстанс. Если на проде
  // неожиданно увидим "invite-only: OFF" или "dev-bypass: ON" — это повод
  // немедленно откатиться / поправить env.
  const bootLogger = new Logger('Bootstrap');
  const inviteOnly = isInviteOnlyModeEnabled();
  const devBypass =
    process.env.MATCH_DEV_AUTH_BYPASS?.trim().toLowerCase() === '1';
  const devBypassInProd =
    process.env.MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION?.trim().toLowerCase() ===
    '1';
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const bypassUsernames = (process.env.MATCH_INVITE_BYPASS_USERNAMES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  bootLogger.log(
    `NODE_ENV=${nodeEnv} invite-only=${inviteOnly ? 'ON' : 'OFF'} ` +
      `dev-bypass=${devBypass ? 'ON' : 'off'} ` +
      `dev-bypass-in-prod=${devBypassInProd ? 'ON' : 'off'} ` +
      `admins=${adminEmails.length} bypass-usernames=${bypassUsernames.length}`,
  );
  if (nodeEnv === 'production' && !inviteOnly) {
    bootLogger.warn(
      'invite-only is DISABLED in production — anyone can register without a code',
    );
  }
  if (nodeEnv === 'production' && devBypass) {
    bootLogger.error(
      'MATCH_DEV_AUTH_BYPASS is ENABLED in production — this is a developer-only switch, disable before real traffic',
    );
  }
}
void bootstrap();
