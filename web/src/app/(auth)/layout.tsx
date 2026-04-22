import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/db/prisma';
import { Navbar } from '@/components/layout/Navbar';

const COOKIE_NAME = 'auth-token';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  let uid: string | null = null;

  if (token) {
    try {
      const payload = await verifyUserToken(token);
      uid = payload.uid;
    } catch {
      uid = null;
    }
  }

  let user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (user && user.status === 'banned') user = null;

  if (!user) {
    // 无有效 token → 通过 Route Handler 创建匿名用户并写入 cookie
    redirect('/api/auth/anon-bootstrap');
  }

  return (
    <>
      <Navbar userId={user.userId} points={user.points} />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-8">{children}</main>
    </>
  );
}

export const dynamic = 'force-dynamic';
