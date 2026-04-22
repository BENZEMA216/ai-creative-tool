import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { PACKAGES_SEED } from '../helpers/package-seed';
import { getPackageInfo, isValidPackageType, listActivePackages } from '@/lib/domain/packages';

beforeEach(async () => {
  await resetDb();
  // resetDb already upserts packages, re-seed here for explicit clarity
  for (const p of PACKAGES_SEED) {
    await testPrisma.package.upsert({ where: { code: p.code }, update: p, create: p });
  }
});

describe('getPackageInfo', () => {
  it('returns the package by code', async () => {
    const p = await getPackageInfo('standard');
    expect(p.yuan).toBe(39.9);
    expect(p.points).toBe(5000);
    expect(p.name).toBe('标准');
  });

  it('throws on unknown / inactive package', async () => {
    await testPrisma.package.update({ where: { code: 'basic' }, data: { active: false } });
    await expect(getPackageInfo('basic')).rejects.toThrow();
  });
});

describe('isValidPackageType', () => {
  it('accepts enum values', () => {
    expect(isValidPackageType('basic')).toBe(true);
    expect(isValidPackageType('standard')).toBe(true);
    expect(isValidPackageType('premium')).toBe(true);
  });

  it('rejects others', () => {
    expect(isValidPackageType('foo')).toBe(false);
    expect(isValidPackageType('')).toBe(false);
  });
});

describe('listActivePackages', () => {
  it('returns 3 seeded packages sorted', async () => {
    const list = await listActivePackages();
    expect(list).toHaveLength(3);
    expect(list[0].code).toBe('basic');
    expect(list[2].code).toBe('premium');
  });

  it('excludes inactive', async () => {
    await testPrisma.package.update({ where: { code: 'premium' }, data: { active: false } });
    const list = await listActivePackages();
    expect(list.map(p => p.code)).toEqual(['basic', 'standard']);
  });
});
