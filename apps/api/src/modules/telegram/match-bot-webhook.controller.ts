import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendTelegramMessage } from './telegram-send';

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

@Controller('telegram-webhook/match')
export class MatchBotWebhookController {
  private readonly logger = new Logger(MatchBotWebhookController.name);

  constructor(private readonly config: ConfigService) {}

  @Post()
  @HttpCode(200)
  handleUpdate(@Body() body: TelegramUpdate): { ok: boolean } {
    const token = this.config.get<string>('MATCH_BOT_TOKEN')?.trim();
    const miniAppUrl = this.config.get<string>('MATCH_MINIAPP_URL')?.trim();
    if (!token || !miniAppUrl) {
      this.logger.warn(
        'MATCH_BOT_TOKEN or MATCH_MINIAPP_URL is not configured',
      );
      return { ok: true };
    }

    const text = body.message?.text?.trim().toLowerCase();
    const chatId = body.message?.chat?.id;
    if (!chatId) return { ok: true };

    if (text === '/match' || text === '/start') {
      void sendTelegramMessage(
        token,
        String(chatId),
        'Найди команду или клиентов за минуту 🔥',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Открыть Match', web_app: { url: miniAppUrl } }],
            ],
          },
        },
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`sendTelegramMessage failed: ${message}`);
      });
    }

    return { ok: true };
  }
}
