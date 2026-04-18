import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserToken } from '@/lib/core/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const token = cookies().get('auth-token')?.value;
  if (token) {
    try {
      await verifyUserToken(token);
      redirect('/dashboard');
    } catch {
      // token 无效，继续展示登录页
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <GlassCard className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-editorial text-4xl text-white">AI 智能创作</h1>
          <p className="mt-2 text-sm text-white/60">让创作更简单</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-white/40">
          登录即表示同意《用户协议》
        </p>
      </GlassCard>
    </main>
  );
}
