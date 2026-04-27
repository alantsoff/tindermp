import { NotificationService } from './notification.service';

// Мокируем фактический отправитель — все тесты проверяют логику ворот
// (mute / per-kind / throttle), а не сам HTTP-вызов в Telegram API.
jest.mock('../telegram/telegram-send', () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue({ ok: true }),
}));

import { sendTelegramMessage } from '../telegram/telegram-send';
const sendMock = sendTelegramMessage as jest.MockedFunction<
  typeof sendTelegramMessage
>;

const ALL_FLAGS_TRUE = {
  notifyMatch: true,
  notifyIncomingLike: true,
  notifyMessage: true,
  notifyInvite: true,
  notifyDigest: true,
};

function buildService(
  profile: {
    notificationsMuted?: boolean;
    settings?: typeof ALL_FLAGS_TRUE | null;
    telegramId?: string | null;
  } | null,
  eventLogFindFirstResult: { id: bigint } | null = null,
) {
  const prisma = {
    matchProfile: {
      findUnique: jest.fn().mockResolvedValue(
        profile === null
          ? null
          : {
              id: 'p1',
              notificationsMuted: profile.notificationsMuted ?? false,
              user: { telegramId: profile.telegramId ?? '12345' },
              settings: profile.settings ?? ALL_FLAGS_TRUE,
            },
      ),
    },
    matchEventLog: {
      findFirst: jest.fn().mockResolvedValue(eventLogFindFirstResult),
    },
  };
  const eventLogger = { log: jest.fn() };
  const service = new NotificationService(prisma as never, eventLogger as never);
  return { service, prisma, eventLogger };
}

describe('NotificationService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MATCH_BOT_TOKEN = 'test-token';
    process.env.MATCH_MINIAPP_URL = 'https://miniapp.example';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends and logs NOTIFICATION_SENT on happy path', async () => {
    const { service, eventLogger } = buildService({});
    const result = await service.send('p1', 'match', { text: 'hello' });
    expect(result).toEqual({ sent: true, reason: 'sent' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(eventLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'NOTIFICATION_SENT' }),
    );
  });

  it('returns profile_not_found when profile is missing', async () => {
    const { service } = buildService(null);
    const result = await service.send('missing', 'match', { text: 'x' });
    expect(result.reason).toBe('profile_not_found');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns no_token when bot token env is empty', async () => {
    process.env.MATCH_BOT_TOKEN = '';
    process.env.REALSKLADCHINA_BOT_TOKEN = '';
    process.env.TELEGRAM_BOT_TOKEN = '';
    const { service } = buildService({});
    const result = await service.send('p1', 'match', { text: 'x' });
    expect(result.reason).toBe('no_token');
  });

  it('respects master notificationsMuted and logs NOTIFICATION_THROTTLED', async () => {
    const { service, eventLogger } = buildService({ notificationsMuted: true });
    const result = await service.send('p1', 'match', { text: 'x' });
    expect(result).toEqual({ sent: false, reason: 'master_muted' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(eventLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOTIFICATION_THROTTLED',
        payload: expect.objectContaining({ reason: 'master_muted' }),
      }),
    );
  });

  it('respects per-kind opt-out (notifyMessage=false skips message kind only)', async () => {
    const { service } = buildService({
      settings: { ...ALL_FLAGS_TRUE, notifyMessage: false },
    });
    const off = await service.send('p1', 'message', { text: 'x' });
    expect(off.reason).toBe('kind_disabled');

    const on = await service.send('p1', 'match', { text: 'x' });
    expect(on.reason).toBe('sent');
  });

  it('throttles message kind when a recent NOTIFICATION_SENT exists for this pair', async () => {
    // Симулируем найденный recent log — throttle должен сработать.
    const { service, eventLogger } = buildService(
      {},
      { id: BigInt(1) },
    );
    const result = await service.send('p1', 'message', {
      text: 'x',
      throttleKey: 'pair-7',
    });
    expect(result.reason).toBe('throttled');
    expect(sendMock).not.toHaveBeenCalled();
    expect(eventLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOTIFICATION_THROTTLED',
        payload: expect.objectContaining({ reason: 'rate_limited' }),
      }),
    );
  });

  it('does not throttle match kind (window=0)', async () => {
    const { service, prisma } = buildService({});
    const result = await service.send('p1', 'match', { text: 'x' });
    expect(result.reason).toBe('sent');
    // findFirst по логу не должен вызываться для kind с throttle=0.
    expect(prisma.matchEventLog.findFirst).not.toHaveBeenCalled();
  });

  it('appends webAppPathSuffix to MATCH_MINIAPP_URL in inline button', async () => {
    const { service } = buildService({});
    await service.send('p1', 'match', {
      text: 'x',
      webAppPathSuffix: '?pair=42',
    });
    expect(sendMock).toHaveBeenCalledWith(
      'test-token',
      '12345',
      'x',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({
                web_app: { url: 'https://miniapp.example?pair=42' },
              }),
            ],
          ],
        },
      }),
    );
  });
});
