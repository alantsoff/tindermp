import { Module } from '@nestjs/common';
import { MatchBotWebhookController } from './match-bot-webhook.controller';

@Module({
  controllers: [MatchBotWebhookController],
})
export class TelegramModule {}
