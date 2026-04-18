'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: number;
  user_id: string;
  type: string;
  platform: string;
  status: string;
  points_consumed: number;
  video_url: string;
  created_at: string;
}

export function RecordsUI() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/records?${params.toString()}`);
    const json = await res.json();
    if (json.code === 0) {
      setItems(json.data.items);
      setTotal(json.data.total);
    }
  }

  useEffect(() => { load(); }, [page, type, status]);

  function exportCsv() {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    window.location.href = `/api/admin/records/export?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <select value={type} onChange={e => { setPage(1); setType(e.target.value); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          <option value="">所有类型</option>
          <option value="extract_text">文案提取</option>
          <option value="download_video">视频下载</option>
        </select>
        <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          <option value="">所有状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <button onClick={exportCsv} className="ml-auto rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">📥 导出 CSV</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-left">User ID</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">平台</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-right">消耗积分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {items.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-gray-500">{new Date(r.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2">{r.user_id}</td>
                <td className="px-3 py-2">{r.type === 'extract_text' ? '文案提取' : '视频下载'}</td>
                <td className="px-3 py-2">{r.platform}</td>
                <td className="px-3 py-2">
                  <span className={r.status === 'failed' ? 'text-red-600' : 'text-green-600'}>{r.status}</span>
                </td>
                <td className="px-3 py-2 text-right">{r.points_consumed}</td>
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
