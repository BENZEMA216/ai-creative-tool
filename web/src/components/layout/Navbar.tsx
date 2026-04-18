'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  points: number;
}

export function Navbar({ userId, points }: Props) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="font-editorial text-xl text-white">
          AI 智能创作
        </Link>
        <nav className="hidden gap-6 text-sm text-white/70 md:flex">
          <Link href="/dashboard" className="hover:text-white">工作台</Link>
          <Link href="/history" className="hover:text-white">使用记录</Link>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/80">🪙 {points.toLocaleString()}</span>
          <span className="hidden text-white/40 sm:inline">{userId}</span>
          <Link
            href="/recharge"
            className="rounded-lg border border-white/20 px-3 py-1 text-white/80 hover:bg-white/10"
          >
            充值
          </Link>
          <button
            onClick={logout}
            className="text-white/60 hover:text-white"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
