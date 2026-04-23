import { telegramFetch } from '../../common/telegram-fetch';

type InlineButton = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
};

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  options?: { reply_markup?: { inline_keyboard?: Array<Array<InlineButton>> } },
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await telegramFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options,
      }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
    };
    if (payload.ok) return { ok: true };
    return {
      ok: false,
      error: payload.description ?? `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
