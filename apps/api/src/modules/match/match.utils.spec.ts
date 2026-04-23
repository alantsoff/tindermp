import {
  generateInviteCode,
  isInviteOnlyModeEnabled,
  normalizeInviteCode,
} from './match.utils';

describe('generateInviteCode', () => {
  it('формат XXXXX-XXXXX, длина 11', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(code).toHaveLength(11);
    }
  });

  it('не использует I, O, 0, 1', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateInviteCode()).not.toMatch(/[IO01]/);
    }
  });

  it('не дублируется в большой выборке', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) seen.add(generateInviteCode());
    expect(seen.size).toBe(1_000);
  });
});

describe('normalizeInviteCode', () => {
  it('uppercase, не трогает дефис', () => {
    expect(normalizeInviteCode(' abcde-fghjk ')).toBe('ABCDE-FGHJK');
  });

  it('не ломает legacy-коды 4-4', () => {
    expect(normalizeInviteCode('abcd-efgh')).toBe('ABCD-EFGH');
  });
});

describe('isInviteOnlyModeEnabled', () => {
  const original = process.env.MATCH_INVITE_ONLY;
  afterEach(() => {
    if (original === undefined) delete process.env.MATCH_INVITE_ONLY;
    else process.env.MATCH_INVITE_ONLY = original;
  });

  it('не задана → true (fail-safe)', () => {
    delete process.env.MATCH_INVITE_ONLY;
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });

  it('пустая → true', () => {
    process.env.MATCH_INVITE_ONLY = '';
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', 'FALSE'])('%s → false', (value) => {
    process.env.MATCH_INVITE_ONLY = value;
    expect(isInviteOnlyModeEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'garbage'])('%s → true', (value) => {
    process.env.MATCH_INVITE_ONLY = value;
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });
});
