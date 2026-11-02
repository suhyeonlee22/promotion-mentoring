import { describe, it, expect } from 'vitest';
import { addDays, addMonths, daysInclusive } from '@/domain/date';

describe('addMonths', () => {
  it('같은 날짜로 이동한다', () => {
    expect(addMonths('2024-01-01', 24)).toBe('2026-01-01');
    expect(addMonths('2022-12-31', 48)).toBe('2026-12-31');
  });
  it('없는 날짜는 그 달의 마지막 날이 된다', () => {
    expect(addMonths('2026-03-31', 18)).toBe('2027-09-30');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
  });
  it('음수도 된다', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('addDays', () => {
  it('월·연도를 넘어간다', () => {
    expect(addDays('2026-07-01', 184)).toBe('2027-01-01');
    expect(addDays('2026-12-01', 59)).toBe('2027-01-29');
    expect(addDays('2026-11-01', -30)).toBe('2026-10-02');
  });
});

describe('daysInclusive', () => {
  it('양 끝을 포함해 센다', () => {
    expect(daysInclusive('2024-03-01', '2024-08-31')).toBe(184);
    expect(daysInclusive('2026-02-01', '2026-03-31')).toBe(59);
    expect(daysInclusive('2026-01-15', '2026-01-15')).toBe(1);
  });
  it('to가 앞이면 0', () => {
    expect(daysInclusive('2026-02-01', '2026-01-31')).toBe(0);
  });
});
