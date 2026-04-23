import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
}
void bootstrap();
