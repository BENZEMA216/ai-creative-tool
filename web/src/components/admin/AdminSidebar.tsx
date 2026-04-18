'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const NAV = [
  { href: '/admin/users', label: '👥 用户管理' },
  { href: '/admin/records', label: '📋 使用记录' },
  { href: '/admin/change-password', label: '🔑 修改密码' },
];

export function AdminSidebar({ username }: { username: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    document.cookie = 'admin-token=; Path=/; Max-Age=0';
    router.push('/admin/login');
  }

  return (
    <aside className="w-56 bg-gray-900 text-white p-4 space-y-1">
      <div className="mb-6 px-2">
        <div className="text-sm text-white/60">登录身份</div>
        <div className="font-medium">{username}</div>
      </div>
      {NAV.map(n => (
        <Link
          key={n.href}
          href={n.href}
          className={clsx(
            'block rounded-lg px-3 py-2 text-sm',
            pathname === n.href ? 'bg-white/10' : 'hover:bg-white/5'
          )}
        >
          {n.label}
        </Link>
      ))}
      <button onClick={logout} className="mt-6 w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5">
        退出登录
      </button>
    </aside>
  );
}
