import { GlassCard } from '@/components/ui/GlassCard';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">工作台</h1>
        <p className="mt-1 text-sm text-white/60">视频文案提取 + 视频下载（P2 实现）</p>
      </div>
      <GlassCard>
        <p className="text-white/70">
          骨架已就绪。文案提取与视频下载功能将在 Plan 2 (P2) 实现。
        </p>
      </GlassCard>
    </div>
  );
}
