import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserToken } from '@/lib/security/jwt';
import { prisma } from '@/lib/db/prisma';
import { RechargeUI } from './RechargeUI';

export default async function RechargePage() {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');
  const payload = await verifyUserToken(token).catch(() => null);
  if (!payload) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">💰 积分充值</h1>
        <p className="mt-1 text-sm text-white/60">选择套餐，扫码完成支付</p>
      </div>
      <RechargeUI initialPoints={user.points} />
    </div>
  );
}
