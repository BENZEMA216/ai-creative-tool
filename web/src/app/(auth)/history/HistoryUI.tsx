'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Record {
  id: number;
  type: 'extract_text' | 'download_video';
  platform: string;
  status: 'success' | 'failed';
  points_consumed: number;
  video_url: string;
  created_at: string;
}

export function HistoryUI() {
  const [items, setItems] = useState<Record[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (type) params.set('type', type);
    fetch(`/api/history/list?${params.toString()}`)
      .then(r => r.json())
      .then(json => {
        if (json.code === 0) {
          setItems(json.data.items);
          setTotal(json.data.total);
        }
      })
      .finally(() => setLoading(false));
  }, [page, type]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <label className="text-white/60">筛选类型：</label>
        <select
          value={type}
          onChange={e => { setPage(1); setType(e.target.value); }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white"
        >
          <option value="">全部</option>
          <option value="extract_text">📝 文案提取</option>
          <option value="download_video">📥 视频下载</option>
        </select>
      </div>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60">
            <tr>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">平台</th>
              <th className="px-3 py-2 text-left">视频链接</th>
              <th className="px-3 py-2 text-right">积分</th>
              <th className="px-3 py-2 text-center">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-white/40">加载中...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-white/40">暂无记录</td></tr>
            )}
            {!loading && items.map(r => (
              <tr key={r.id} className="text-white/80 hover:bg-white/5">
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-3 py-2">{r.type === 'extract_text' ? '文案提取' : '视频下载'}</td>
                <td className="px-3 py-2">{r.platform}</td>
                <td className="px-3 py-2 max-w-xs truncate"><a href={r.video_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{r.video_url}</a></td>
                <td className={`px-3 py-2 text-right ${r.points_consumed > 0 ? 'text-red-400' : 'text-white/40'}`}>
                  {r.points_consumed > 0 ? `-${r.points_consumed}` : '0'}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.status === 'success' ? '✅' : '❌'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← 上一页</Button>
        <span className="text-white/60">第 {page} / {totalPages} 页（共 {total} 条）</span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页 →</Button>
      </div>
    </div>
  );
}
