'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const json = await res.json();
      if (json.code !== 0) { setErr(json.message); return; }
      if (json.data.must_change_password) router.push('/admin/change-password');
      else router.push('/admin/users');
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-md">
        <h1 className="text-2xl font-medium text-gray-900">后台管理登录</h1>
        <input
          type="text"
          placeholder="用户名"
          value={u}
          onChange={e => setU(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
        />
        <input
          type="password"
          placeholder="密码"
          value={p}
          onChange={e => setP(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={submit}
          disabled={busy || !u || !p}
          className="w-full rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </div>
    </main>
  );
}
