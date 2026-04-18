import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { DashboardTabs } from './DashboardTabs';

export default async function DashboardPage() {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');
  const payload = await verifyUserToken(token).catch(() => null);
  if (!payload) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">工作台</h1>
        <p className="mt-1 text-sm text-white/60">粘贴短视频链接 → 文案提取 / 视频下载</p>
      </div>
      <DashboardTabs initialPoints={user.points} />
    </div>
  );
}
