import { NextRequest, NextResponse } from 'next/server';
import { verifyUserToken, signUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { createAnonUser } from '@/lib/core/anon-user';

const COOKIE_NAME = 'auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  // If already have a valid token pointing to an existing non-banned user, skip creation
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    try {
      const payload = await verifyUserToken(existing);
      const user = await prisma.user.findUnique({ where: { id: payload.uid } });
      if (user && user.status !== 'banned') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    } catch {
      // fall through to create anon
    }
  }

  const anon = await createAnonUser();
  const token = await signUserToken({ uid: anon.uid, userId: anon.userId });

  const res = NextResponse.redirect(new URL('/dashboard', req.url));
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
