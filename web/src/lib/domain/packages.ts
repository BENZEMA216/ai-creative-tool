import type { PackageType } from '@prisma/client';

export const PACKAGES = {
  basic:    { yuan: 19.9, points: 2000 },
  standard: { yuan: 39.9, points: 5000 },
  premium:  { yuan: 99.9, points: 12000 },
} as const;

export function isValidPackageType(s: string): s is PackageType {
  return s === 'basic' || s === 'standard' || s === 'premium';
}

export function getPackageInfo(type: PackageType): { yuan: number; points: number } {
  if (!isValidPackageType(type)) throw new Error(`unknown package type: ${type}`);
  return PACKAGES[type];
}

export const ORDER_EXPIRY_MS = 15 * 60 * 1000;
