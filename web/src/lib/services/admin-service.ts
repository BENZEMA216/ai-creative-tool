import bcrypt from 'bcryptjs';
import { AppError, ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { signAdminToken } from '@/lib/core/auth';
import { adminAdjustPoints } from '@/lib/core/points';
import type { AdminRole, UsageType, UsageStatus } from '@prisma/client';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export interface AdminLoginResult {
  token: string;
  username: string;
  role: AdminRole;
  must_change_password: boolean;
}

export async function adminLogin(username: string, password: string): Promise<AdminLoginResult> {
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) throw new AppError(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw new AppError(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const token = await signAdminToken({ aid: admin.id, username: admin.username, role: admin.role });
  return {
    token,
    username: admin.username,
    role: admin.role,
    must_change_password: admin.mustChangePassword,
  };
}

export async function changeAdminPassword(adminId: number, oldPw: string, newPw: string): Promise<void> {
  const a = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!a) throw new AppError(ErrCode.AdminPermissionDenied, 'admin not found');

  const valid = await bcrypt.compare(oldPw, a.passwordHash);
  if (!valid) throw new AppError(ErrCode.AdminPermissionDenied, '旧密码错误');

  const newHash = await bcrypt.hash(newPw, 12);
  await prisma.adminUser.update({
    where: { id: a.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });
}

export interface AdminMeResult {
  username: string;
  role: AdminRole;
  must_change_password: boolean;
}

export async function getAdminProfile(adminId: number): Promise<AdminMeResult> {
  const a = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!a) throw new AppError(ErrCode.AdminPermissionDenied, 'admin not found');
  return {
    username: a.username,
    role: a.role,
    must_change_password: a.mustChangePassword,
  };
}

export interface ListUsersParams {
  page: number;
  pageSize: number;
  q?: string;
}
export interface ListUsersResult {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    id: string;
    user_id: string;
    phone: string;
    nickname: string;
    points: number;
    status: 'active' | 'banned';
    created_at: string;
  }>;
}
export async function listUsers(params: ListUsersParams): Promise<ListUsersResult> {
  const where = params.q
    ? { OR: [{ userId: { contains: params.q, mode: 'insensitive' as const } }, { phone: { contains: params.q } }] }
    : undefined;

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  return {
    total,
    page: params.page,
    page_size: params.pageSize,
    items: items.map(u => ({
      id: u.id,
      user_id: u.userId,
      phone: maskPhone(u.phone),
      nickname: u.nickname,
      points: u.points,
      status: u.status,
      created_at: u.createdAt.toISOString(),
    })),
  };
}

export async function adjustUserPoints(userId: string, amount: number, reason: string): Promise<{ balance_after: number }> {
  try {
    const result = await adminAdjustPoints({
      userId,
      amount,
      description: `[ADMIN] ${reason}`,
    });
    return { balance_after: result.balanceAfter };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '调整失败';
    throw new AppError(ErrCode.InternalError, msg);
  }
}

export async function setUserBan(userId: string, banned: boolean): Promise<{ id: string; status: 'active' | 'banned' }> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { status: banned ? 'banned' : 'active' },
  });
  return { id: u.id, status: u.status };
}

export interface ListRecordsParams {
  page: number;
  pageSize: number;
  userIdFilter?: string;
  type?: UsageType;
  platform?: string;
  status?: UsageStatus;
}
export async function listUsageRecords(params: ListRecordsParams) {
  const where: Record<string, unknown> = {};
  if (params.type) where.type = params.type;
  if (params.platform) where.platform = params.platform;
  if (params.status) where.status = params.status;
  if (params.userIdFilter) {
    where.user = { userId: { contains: params.userIdFilter, mode: 'insensitive' } };
  }

  const [total, items] = await Promise.all([
    prisma.usageRecord.count({ where }),
    prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { user: { select: { userId: true } } },
    }),
  ]);

  return {
    total,
    page: params.page,
    page_size: params.pageSize,
    items: items.map(r => ({
      id: r.id,
      user_id: r.user.userId,
      type: r.type,
      platform: r.platform,
      status: r.status,
      points_consumed: r.pointsConsumed,
      video_url: r.videoUrl,
      video_duration: r.videoDuration,
      error_message: r.errorMessage,
      created_at: r.createdAt.toISOString(),
    })),
  };
}

export async function exportUsageRecordsCsv(params: Omit<ListRecordsParams, 'page' | 'pageSize'>): Promise<string> {
  const { stringify } = await import('csv-stringify/sync');

  const where: Record<string, unknown> = {};
  if (params.type) where.type = params.type;
  if (params.platform) where.platform = params.platform;
  if (params.status) where.status = params.status;

  const items = await prisma.usageRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10_000,
    include: { user: { select: { userId: true } } },
  });

  const rows = items.map(r => ({
    user_id: r.user.userId,
    type: r.type,
    platform: r.platform,
    status: r.status,
    points_consumed: r.pointsConsumed,
    video_url: r.videoUrl,
    video_duration: r.videoDuration ?? '',
    error_message: r.errorMessage ?? '',
    created_at: r.createdAt.toISOString(),
  }));

  return stringify(rows, {
    header: true,
    columns: ['user_id', 'type', 'platform', 'status', 'points_consumed', 'video_url', 'video_duration', 'error_message', 'created_at'],
  });
}
