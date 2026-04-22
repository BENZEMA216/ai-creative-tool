import { NextRequest, NextResponse } from 'next/server';
import { verifyUserToken, signUserToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/db/prisma';
import { createAnonUser } from '@/lib/services/anon-user';

const COOKIE_NAME = 'auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

// 用相对 Location，避免 docker 容器内 req.url 写成 localhost 把浏览器带偏
function redirectRelative(pathname: string): NextResponse {
  const res = new NextResponse(null, { status: 307 });
  res.headers.set('Location', pathname);
  return res;
}

export async function GET(req: NextRequest) {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    try {
      const payload = await verifyUserToken(existing);
      const user = await prisma.user.findUnique({ where: { id: payload.uid } });
      if (user && user.status !== 'banned') {
        return redirectRelative('/dashboard');
      }
    } catch {
      // fall through
    }
  }

  const anon = await createAnonUser();
  const token = await signUserToken({ uid: anon.uid, userId: anon.userId });

  const res = redirectRelative('/dashboard');
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
