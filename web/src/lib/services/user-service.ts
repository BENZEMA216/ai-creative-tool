import { randomInt } from 'node:crypto';
import { AppError, ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { generateUserId } from '@/lib/core/user-id';
import { signUserToken } from '@/lib/core/auth';
import { createAnonUser } from '@/lib/core/anon-user';
import { rateLimit } from '@/lib/core/rate-limit';
import { getSmsClient } from '@/lib/clients/sms';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export interface SendCodeResult { expire_in: number; }

/**
 * 发送短信验证码（rate-limited + 持久化 + mock/real 双轨）。
 */
export async function sendSmsCode(phone: string): Promise<SendCodeResult> {
  const allowed = await rateLimit(`sms:${phone}`, 1, 60);
  if (!allowed) throw new AppError(ErrCode.SmsSendFailed, '请求过于频繁，请 60 秒后再试');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiredAt = new Date(Date.now() + 300_000);

  await prisma.smsCode.create({
    data: { phone, code, purpose: 'login', expiredAt },
  });

  try {
    await getSmsClient().sendCode(phone, code, 'login');
  } catch (e) {
    const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '短信发送失败');
    throw new AppError(ErrCode.SmsSendFailed, msg);
  }

  return { expire_in: 300 };
}

export interface LoginResult {
  user_id: string;
  phone: string;
  nickname: string;
  points: number;
  is_new_user: boolean;
  token: string;
}

/**
 * 手机号 + 验证码登录/自动注册。返回 token（调用方设 cookie）。
 */
export async function loginWithCode(phone: string, code: string): Promise<LoginResult> {
  const codeRow = await prisma.smsCode.findFirst({
    where: { phone, code, used: false, expiredAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!codeRow) throw new AppError(ErrCode.TokenInvalid, '验证码错误或已过期');
  await prisma.smsCode.update({ where: { id: codeRow.id }, data: { used: true } });

  let user = await prisma.user.findUnique({ where: { phone } });
  let isNew = false;
  if (!user) {
    isNew = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidateId = generateUserId();
      try {
        user = await prisma.user.create({ data: { userId: candidateId, phone } });
        break;
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
  }
  if (!user) throw new AppError(ErrCode.InternalError, '用户创建失败');
  if (user.status === 'banned') throw new AppError(ErrCode.AccountBanned, '账号已被封禁');

  const token = await signUserToken({ uid: user.id, userId: user.userId });
  return {
    user_id: user.userId,
    phone: maskPhone(user.phone),
    nickname: user.nickname,
    points: user.points,
    is_new_user: isNew,
    token,
  };
}

export interface UserProfileResult {
  user_id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
  points: number;
}

/**
 * 获取当前用户 profile。
 */
export async function getUserProfile(userId: string): Promise<UserProfileResult> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new AppError(ErrCode.Unauthorized, '用户不存在');
  if (u.status === 'banned') throw new AppError(ErrCode.AccountBanned, '账号已被封禁');
  return {
    user_id: u.userId,
    phone: maskPhone(u.phone),
    nickname: u.nickname,
    avatar_url: u.avatarUrl,
    points: u.points,
  };
}

/**
 * 匿名登录：创建用户（调用 createAnonUser from lib/core）+ 签 token。
 */
export async function anonLogin(): Promise<{ token: string; userId: string }> {
  const anon = await createAnonUser();
  const token = await signUserToken({ uid: anon.uid, userId: anon.userId });
  return { token, userId: anon.userId };
}
