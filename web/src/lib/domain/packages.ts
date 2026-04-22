import type { PackageType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export { PackageType };

export const ORDER_EXPIRY_MS = 15 * 60 * 1000;

export function isValidPackageType(s: string): s is PackageType {
  return s === 'basic' || s === 'standard' || s === 'premium';
}

export interface PackagePrice {
  yuan: number;
  points: number;
  name: string;
  badge: string | null;
}

/**
 * Look up package price from DB. Throws if not active / not found.
 */
export async function getPackageInfo(type: PackageType): Promise<PackagePrice> {
  const p = await prisma.package.findUnique({ where: { code: type } });
  if (!p || !p.active) throw new Error(`unknown or inactive package: ${type}`);
  return {
    yuan: Number(p.yuan),
    points: p.points,
    name: p.name,
    badge: p.badge,
  };
}

/**
 * List all active packages, sorted.
 */
export async function listActivePackages(): Promise<Array<PackagePrice & { code: PackageType }>> {
  const list = await prisma.package.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
  return list.map(p => ({
    code: p.code as PackageType,
    yuan: Number(p.yuan),
    points: p.points,
    name: p.name,
    badge: p.badge,
  }));
}
