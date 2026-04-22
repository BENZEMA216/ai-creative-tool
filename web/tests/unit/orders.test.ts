import { describe, it, expect } from 'vitest';
import { PACKAGES, getPackageInfo, isValidPackageType } from '@/lib/domain/packages';

describe('PACKAGES', () => {
  it('has basic / standard / premium with correct values', () => {
    expect(PACKAGES.basic).toEqual({ yuan: 19.9, points: 2000 });
    expect(PACKAGES.standard).toEqual({ yuan: 39.9, points: 5000 });
    expect(PACKAGES.premium).toEqual({ yuan: 99.9, points: 12000 });
  });
});

describe('getPackageInfo', () => {
  it('returns the package by type', () => {
    const p = getPackageInfo('standard');
    expect(p.yuan).toBe(39.9);
    expect(p.points).toBe(5000);
  });
  it('throws on unknown type', () => {
    expect(() => getPackageInfo('foo' as 'basic')).toThrow();
  });
});

describe('isValidPackageType', () => {
  it('accepts valid types', () => {
    expect(isValidPackageType('basic')).toBe(true);
    expect(isValidPackageType('standard')).toBe(true);
    expect(isValidPackageType('premium')).toBe(true);
  });
  it('rejects others', () => {
    expect(isValidPackageType('foo')).toBe(false);
    expect(isValidPackageType('')).toBe(false);
  });
});
