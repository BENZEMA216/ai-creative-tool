import { NextResponse } from 'next/server';
import { parse as parseCookie } from 'cookie';
import { verifyAdminToken, type AdminTokenPayload } from '@/lib/core/auth';
import { ErrCode } from '@/lib/core/errors';
import { err } from '@/lib/core/http';

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

export async function withAdminAuth(
  req: Request,
  handler: (req: Request, admin: AdminTokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  const admin = await getAdminFromReq(req);
  if (!admin) return err(ErrCode.AdminPermissionDenied, '请登录后台');
  return handler(req, admin);
}
