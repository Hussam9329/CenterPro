import { describe, expect, it } from 'vitest';
import { DAILY_WORDS, dailyWord, normalizeWord } from '../../src/lib/rest/daily-word';

describe('rest daily word', () => {
  it('only contains unique five-letter Arabic words without diacritics', () => {
    for (const word of DAILY_WORDS) {
      expect(Array.from(word), word).toHaveLength(5);
      expect(word, word).toMatch(/^[ء-ي]+$/u);
    }
    expect(new Set(DAILY_WORDS.map(normalizeWord)).size).toBe(DAILY_WORDS.length);
  });

  it('gives everyone the same word for a day and changes it the next day', () => {
    expect(dailyWord('2026-10-20')).toBe(dailyWord('2026-10-20'));
    expect(dailyWord('2026-10-20')).not.toBe(dailyWord('2026-10-21'));
  });

  it('normalizes alef forms so the keyboard can type every word', () => {
    expect(normalizeWord('مدفأة')).toBe('مدفاة');
    for (const date of ['2026-01-01', '2026-06-15', '2027-03-09']) expect(dailyWord(date)).not.toMatch(/[أإآى]/u);
  });
});
