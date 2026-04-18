import type { NextRequest } from 'next/server';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { loginSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { generateUserId } from '@/lib/core/user-id';
import { signUserToken } from '@/lib/core/auth';

const COOKIE_NAME = 'auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7d

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(ErrCode.InternalError, '请求体必须是 JSON');
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');
  }
  const { phone, code } = parsed.data;

  // 1. 查最新一条未用且未过期的 code
  const codeRow = await prisma.smsCode.findFirst({
    where: { phone, code, used: false, expiredAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!codeRow) return err(ErrCode.TokenInvalid, '验证码错误或已过期');

  // 2. 标记已用
  await prisma.smsCode.update({ where: { id: codeRow.id }, data: { used: true } });

  // 3. 找/建用户
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
  if (!user) return err(ErrCode.InternalError, '用户创建失败');

  if (user.status === 'banned') return err(ErrCode.AccountBanned, '账号已被封禁');

  // 4. 签 token
  const token = await signUserToken({ uid: user.id, userId: user.userId });

  // 5. 返回 + set-cookie
  const res = ok({
    user_id: user.userId,
    phone: maskPhone(user.phone),
    nickname: user.nickname,
    points: user.points,
    is_new_user: isNew,
    token,
  }, '登录成功');

  res.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
}
