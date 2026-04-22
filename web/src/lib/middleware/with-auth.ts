import { NextResponse } from 'next/server';
import { parse as parseCookie } from 'cookie';
import { verifyUserToken, type UserTokenPayload } from '@/lib/security/jwt';
import { ErrCode } from '@/lib/domain/errors';
import { err } from '@/lib/http/response';
import type { Handler, Middleware } from '@/lib/http/compose';

export async function getUserFromReq(req: Request): Promise<UserTokenPayload | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies = parseCookie(cookieHeader);
  const token = cookies['auth-token'];
  if (!token) return null;
  try {
    return await verifyUserToken(token);
  } catch {
    return null;
  }
}

/**
 * 新接口（middleware factory）：
 *   export const POST = compose(requireAuth())(async (req, ctx) => ...)
 * handler 里用 getUserFromReq(req) 读 user，或者用下面的类型扩展
 */
export function requireAuth(): Middleware {
  return (handler: Handler): Handler => async (req, ctx) => {
    const user = await getUserFromReq(req);
    if (!user) return err(ErrCode.Unauthorized, '请先登录');
    // 挂到 req 上供 handler 使用（使用 Symbol 避免污染）
    (req as Request & { __user?: UserTokenPayload }).__user = user;
    return handler(req, ctx);
  };
}

/**
 * handler 内部读 user。保证已经经过 requireAuth()。
 */
export function getAuthedUser(req: Request): UserTokenPayload {
  const u = (req as Request & { __user?: UserTokenPayload }).__user;
  if (!u) throw new Error('getAuthedUser called on request not wrapped with requireAuth()');
  return u;
}

/**
 * 向后兼容老接口 withAuth(req, handler) — 保留以便渐进迁移
 */
export async function withAuth(
  req: Request,
  handler: (req: Request, user: UserTokenPayload) => Promise<NextResponse | Response>
): Promise<NextResponse> {
  const user = await getUserFromReq(req);
  if (!user) return err(ErrCode.Unauthorized, '请先登录');
  return handler(req, user) as Promise<NextResponse>;
}
