import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatTokens,
  formatTokensShort,
  formatUsd,
  latestDate,
} from '../src/lib/format';

describe('formato español', () => {
  it('agrupa miles también en números de cuatro cifras', () => {
    expect(formatNumber(1200)).toBe('1.200');
    expect(formatNumber(1_000_000)).toBe('1.000.000');
  });

  it('usa coma decimal', () => {
    expect(formatNumber(0.25)).toBe('0,25');
  });

  it('formatea precios en dólares', () => {
    expect(formatUsd(4)).toBe('4 $');
    expect(formatUsd(0.25)).toBe('0,25 $');
    expect(formatUsd(12.5)).toBe('12,50 $');
    expect(formatUsd(0.025)).toBe('0,025 $');
  });

  it('formatea tokens', () => {
    expect(formatTokens(1200)).toBe('1.200 tokens');
    expect(formatTokensShort(1_000_000)).toBe('1 M');
    expect(formatTokensShort(200_000)).toBe('200 K');
    expect(formatTokensShort(1500)).toBe('1.500');
  });

  it('formatea fechas sin depender de la zona horaria', () => {
    expect(formatDate('2026-10-15')).toBe('15 de octubre de 2026');
    expect(formatDate('2026-01-01')).toBe('1 de enero de 2026');
    expect(() => formatDate('15/10/2026')).toThrow();
  });

  it('elige la fecha más reciente', () => {
    expect(latestDate(['2026-09-30', '2026-10-16', '2026-10-01'])).toBe('2026-10-16');
    expect(latestDate([])).toBeUndefined();
  });
});
