'use client';

import { useEffect, useState } from 'react';

interface UserRow {
  id: string;
  user_id: string;
  phone: string;
  points: number;
  status: 'active' | 'banned';
  created_at: string;
}

export function UsersUI() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  async function load() {
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (q) params.set('q', q);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await res.json();
    if (json.code === 0) {
      setItems(json.data.items);
      setTotal(json.data.total);
    }
  }

  useEffect(() => { load(); }, [page]);

  async function adjustPoints(id: string) {
    const amount = prompt('调整数量（正负皆可）');
    if (!amount) return;
    const reason = prompt('原因') ?? '后台调整';
    const res = await fetch(`/api/admin/users/${id}/points`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), reason }),
    });
    const json = await res.json();
    if (json.code === 0) { alert(`新余额：${json.data.balance_after}`); load(); }
    else alert(json.message);
  }

  async function toggleBan(id: string, banned: boolean) {
    if (!confirm(banned ? '确认封禁该用户？' : '确认解封该用户？')) return;
    await fetch(`/api/admin/users/${id}/ban`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ banned }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="按 User ID / 手机号搜索"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }}
          className="flex-1 max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
        />
        <button onClick={() => { setPage(1); load(); }} className="rounded-lg bg-gray-900 px-4 py-2 text-white">搜索</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">User ID</th>
              <th className="px-3 py-2 text-left">手机号</th>
              <th className="px-3 py-2 text-right">积分</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">注册时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {items.map(u => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.user_id}</td>
                <td className="px-3 py-2">{u.phone}</td>
                <td className="px-3 py-2 text-right">{u.points.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={u.status === 'banned' ? 'text-red-600' : 'text-green-600'}>
                    {u.status === 'banned' ? '已封禁' : '正常'}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(u.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => adjustPoints(u.id)} className="text-blue-600 hover:underline">改积分</button>
                  <button onClick={() => toggleBan(u.id, u.status !== 'banned')} className="text-red-600 hover:underline">
                    {u.status === 'banned' ? '解封' : '封禁'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-700">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">← 上一页</button>
        <span>第 {page} 页（共 {total} 条）</span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">下一页 →</button>
      </div>
    </div>
  );
}
