import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { consumePoints, addPoints, adminAdjustPoints, PointsInsufficientError } from '@/lib/services/points-service';

beforeEach(async () => {
  await resetDb();
});

async function makeUser(points: number) {
  return testPrisma.user.create({
    data: { userId: 'AC00000001', phone: '13800138000', points },
  });
}

describe('consumePoints', () => {
  it('deducts points + records transaction + creates usage record', async () => {
    const u = await makeUser(100);
    const result = await consumePoints({
      userId: u.id,
      amount: 10,
      description: '文案提取',
      usageRecord: {
        type: 'extract_text',
        videoUrl: 'https://x',
        platform: 'douyin',
      },
    });

    expect(result.balanceAfter).toBe(90);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(90);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.amount).toBe(-10);
    expect(tx!.balanceAfter).toBe(90);
    expect(tx!.type).toBe('consume');

    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: u.id } });
    expect(ur!.status).toBe('success');
    expect(ur!.pointsConsumed).toBe(10);
  });

  it('throws PointsInsufficientError when balance < amount', async () => {
    const u = await makeUser(5);
    await expect(consumePoints({
      userId: u.id,
      amount: 10,
      description: 'too much',
      usageRecord: { type: 'extract_text', videoUrl: 'https://x', platform: 'douyin' },
    })).rejects.toThrow(PointsInsufficientError);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5);
  });

  it('serializes concurrent deductions correctly (no overdraft)', async () => {
    const u = await makeUser(15);
    const results = await Promise.allSettled([
      consumePoints({ userId: u.id, amount: 10, description: 'a', usageRecord: { type: 'extract_text', videoUrl: 'a', platform: 'douyin' } }),
      consumePoints({ userId: u.id, amount: 10, description: 'b', usageRecord: { type: 'extract_text', videoUrl: 'b', platform: 'douyin' } }),
      consumePoints({ userId: u.id, amount: 10, description: 'c', usageRecord: { type: 'extract_text', videoUrl: 'c', platform: 'douyin' } }),
    ]);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(2);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5);
  });
});

describe('addPoints', () => {
  it('increases balance + creates recharge transaction', async () => {
    const u = await makeUser(0);
    const result = await addPoints({
      userId: u.id,
      amount: 2000,
      description: '充值2000积分',
      relatedOrderId: 'AC2026041801',
    });
    expect(result.balanceAfter).toBe(2000);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.amount).toBe(2000);
    expect(tx!.type).toBe('recharge');
    expect(tx!.relatedOrderId).toBe('AC2026041801');
  });
});

describe('adminAdjustPoints', () => {
  it('can both add and deduct', async () => {
    const u = await makeUser(50);
    await adminAdjustPoints({ userId: u.id, amount: 100, description: 'manual top-up' });
    let r = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(r!.points).toBe(150);

    await adminAdjustPoints({ userId: u.id, amount: -30, description: 'penalty' });
    r = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(r!.points).toBe(120);

    const txns = await testPrisma.pointTransaction.findMany({ where: { userId: u.id }, orderBy: { id: 'asc' } });
    expect(txns).toHaveLength(2);
    expect(txns[0].type).toBe('admin_adjust');
    expect(txns[1].type).toBe('admin_adjust');
  });
});
