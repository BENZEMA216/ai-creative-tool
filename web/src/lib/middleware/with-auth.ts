import { NextResponse } from 'next/server';
import { parse as parseCookie } from 'cookie';
import { verifyUserToken, type UserTokenPayload } from '@/lib/core/auth';
import { ErrCode } from '@/lib/core/errors';
import { err } from '@/lib/core/http';

export interface AuthedReq extends Request {
  user: UserTokenPayload;
}

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

export async function withAuth(
  req: Request,
  handler: (req: Request, user: UserTokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromReq(req);
  if (!user) return err(ErrCode.Unauthorized, '请先登录');
  return handler(req, user);
}
