'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ChangePasswordUI() {
  const router = useRouter();
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
    });
    const json = await res.json();
    if (json.code !== 0) setErr(json.message);
    else { setDone(true); setTimeout(() => router.push('/admin/users'), 1200); }
  }

  return (
    <div className="max-w-sm space-y-3">
      <input type="password" placeholder="旧密码" value={oldPw} onChange={e => setOld(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      <input type="password" placeholder="新密码（≥8位）" value={newPw} onChange={e => setNew(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {done && <p className="text-sm text-green-600">✅ 密码已更新，跳转中...</p>}
      <button onClick={submit} disabled={!oldPw || newPw.length < 8 || done}
        className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
        提交
      </button>
    </div>
  );
}
