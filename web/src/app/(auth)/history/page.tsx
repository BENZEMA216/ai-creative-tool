import { HistoryUI } from './HistoryUI';

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">📋 使用记录</h1>
        <p className="mt-1 text-sm text-white/60">查看你的文案提取和视频下载历史</p>
      </div>
      <HistoryUI />
    </div>
  );
}
