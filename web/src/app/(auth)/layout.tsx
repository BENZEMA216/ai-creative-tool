import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { Navbar } from '@/components/layout/Navbar';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');

  let payload;
  try {
    payload = await verifyUserToken(token);
  } catch {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || user.status === 'banned') redirect('/login');

  return (
    <>
      <Navbar
        userId={user.userId}
        points={user.points}
      />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-8">{children}</main>
    </>
  );
}
