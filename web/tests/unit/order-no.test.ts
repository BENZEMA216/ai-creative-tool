import { describe, it, expect } from 'vitest';
import { generateOrderNo, isValidOrderNo } from '@/lib/core/order-no';

describe('generateOrderNo', () => {
  it('returns AC + 14 digits + 4 alnum', () => {
    const no = generateOrderNo();
    expect(no).toMatch(/^AC\d{14}[A-Z0-9]{4}$/);
    expect(no.length).toBe(20);
  });

  it('produces different IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(generateOrderNo());
    expect(ids.size).toBe(50);
  });
});

describe('isValidOrderNo', () => {
  it('accepts our format', () => {
    expect(isValidOrderNo('AC20260418123456ABCD')).toBe(true);
  });
  it('rejects bad format', () => {
    expect(isValidOrderNo('xx20260418123456ABCD')).toBe(false);
    expect(isValidOrderNo('AC2026041812345')).toBe(false);
    expect(isValidOrderNo('')).toBe(false);
  });
});
