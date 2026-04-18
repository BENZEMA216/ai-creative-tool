import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/core/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('admin-token')?.value;
  if (!token) redirect('/admin/login');
  const payload = await verifyAdminToken(token).catch(() => null);
  if (!payload) redirect('/admin/login');

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar username={payload.username} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
