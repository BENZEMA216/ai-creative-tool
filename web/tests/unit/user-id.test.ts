import { describe, it, expect } from 'vitest';
import { generateUserId, isValidUserId } from '@/lib/util/user-id';

describe('generateUserId', () => {
  it('returns AC + 8 digits', () => {
    const id = generateUserId();
    expect(id).toMatch(/^AC\d{8}$/);
  });

  it('produces different IDs on repeated calls', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateUserId());
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe('isValidUserId', () => {
  it('accepts valid format', () => {
    expect(isValidUserId('AC10086234')).toBe(true);
  });
  it('rejects wrong prefix', () => {
    expect(isValidUserId('AB10086234')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidUserId('AC1234567')).toBe(false);
    expect(isValidUserId('AC123456789')).toBe(false);
  });
  it('rejects non-digit suffix', () => {
    expect(isValidUserId('AC1008623a')).toBe(false);
  });
});
