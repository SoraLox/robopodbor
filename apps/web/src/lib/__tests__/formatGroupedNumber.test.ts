import { describe, expect, it } from 'vitest';
import {
  formatGroupedNumber,
  formatGroupedNumberAtCaret,
  normalizeGroupedNumber,
} from '@/lib/formatGroupedNumber';

describe('formatGroupedNumber', () => {
  it('groups integer digits with thin spaces', () => {
    expect(formatGroupedNumber('10000')).toBe('10\u202f000');
    expect(formatGroupedNumber('1000000')).toBe('1\u202f000\u202f000');
  });

  it('does not group the fractional part', () => {
    expect(formatGroupedNumber('10000.5')).toBe('10\u202f000,5');
    expect(formatGroupedNumber('1,302')).toBe('1,302');
    expect(formatGroupedNumber('12345,6789')).toBe('12\u202f345,6789');
  });

  it('keeps a trailing decimal separator while typing', () => {
    expect(formatGroupedNumber('10,')).toBe('10,');
  });

  it('normalizes back for storage', () => {
    expect(normalizeGroupedNumber('10\u202f000,5')).toBe('10000.5');
    expect(normalizeGroupedNumber('1 302')).toBe('1302');
  });

  it('preserves caret by digit count', () => {
    // "100|00" → "10 000" caret after 3 digits → after "10 0"
    const { value, caret } = formatGroupedNumberAtCaret('10000', 3);
    expect(value).toBe('10\u202f000');
    expect(value.slice(0, caret).replace(/\D/g, '').length).toBe(3);
  });
});
