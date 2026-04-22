import { parse as parseCookie } from 'cookie';
import type { AdminRole } from '@prisma/client';
import { verifyAdminToken, type AdminTokenPayload } from '@/lib/security/jwt';
import { ErrCode } from '@/lib/domain/errors';
import { err } from '@/lib/http/response';
import type { Handler, Middleware } from '@/lib/http/compose';

export const ADMIN_COOKIE = 'admin-token';

export async function getAdminFromReq(req: Request): Promise<AdminTokenPayload | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies = parseCookie(cookieHeader);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return null;
  try {
    return await verifyAdminToken(token);
  } catch {
    return null;
  }
}

/**
 * 新接口（middleware factory）：
 *   requireAdmin()              — any admin
 *   requireAdmin('super_admin') — only super_admin (super_admin bypasses all)
 */
export function requireAdmin(minRole?: AdminRole): Middleware {
  return (handler: Handler): Handler => async (req, ctx) => {
    const admin = await getAdminFromReq(req);
    if (!admin) return err(ErrCode.AdminPermissionDenied, '请登录后台');
    if (minRole && admin.role !== minRole && admin.role !== 'super_admin') {
      return err(ErrCode.AdminPermissionDenied, `需要 ${minRole} 权限`);
    }
    (req as Request & { __admin?: AdminTokenPayload }).__admin = admin;
    return handler(req, ctx);
  };
}

/**
 * handler 内部读 admin。保证已经经过 requireAdmin()。
 */
export function getAuthedAdmin(req: Request): AdminTokenPayload {
  const a = (req as Request & { __admin?: AdminTokenPayload }).__admin;
  if (!a) throw new Error('getAuthedAdmin called on request not wrapped with requireAdmin()');
  return a;
}

