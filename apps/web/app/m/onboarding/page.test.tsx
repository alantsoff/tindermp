import { describe, expect, it } from 'vitest';
import { parseHeadlineToPurposeParts } from '../_lib/purpose';

const PURPOSE_PRESETS = [
  'Найти команду',
  'Нетворкинг',
  'Ищу команду под запуск/масштабирование',
  'Ищу клиентов и проекты',
  'Ищу работу в сильной команде',
  'Ищу подрядчиков для магазина',
  'Хочу нетворкинг в нише',
] as const;

describe('parseHeadlineToPurposeParts', () => {
  it('parses multiple presets and free text', () => {
    expect(
      parseHeadlineToPurposeParts(
        'Найти команду · Нетворкинг — Коротко о себе',
        PURPOSE_PRESETS,
      ),
    ).toEqual({
      purposePresets: ['Найти команду', 'Нетворкинг'],
      purposeText: 'Коротко о себе',
    });
  });

  it('parses single preset without free text', () => {
    expect(
      parseHeadlineToPurposeParts('Найти команду', PURPOSE_PRESETS),
    ).toEqual({
      purposePresets: ['Найти команду'],
      purposeText: '',
    });
  });

  it('keeps free text when no known presets', () => {
    expect(
      parseHeadlineToPurposeParts(
        'Случайный текст без пресета',
        PURPOSE_PRESETS,
      ),
    ).toEqual({
      purposePresets: [],
      purposeText: 'Случайный текст без пресета',
    });
  });

  it('falls back to free text when one preset is unknown', () => {
    expect(
      parseHeadlineToPurposeParts(
        'Найти команду · NeuralPrompt — bla',
        PURPOSE_PRESETS,
      ),
    ).toEqual({
      purposePresets: [],
      purposeText: 'Найти команду · NeuralPrompt — bla',
    });
  });
});
