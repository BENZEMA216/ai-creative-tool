'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  durationText: string;
  duration: number;
  thumbnail: string;
  downloadUrl: string;
}

export function VideoTrimmer(props: Props) {
  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{props.title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{props.platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{props.durationText}</span></div>
      </div>
      {props.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.thumbnail} alt={props.title} className="w-full max-w-md rounded-xl" />
      )}
      <p className="text-xs text-white/50">
        🚧 视频片段裁剪（双滑块 + ffmpeg.wasm）将在 Task 15 完成；当前可下载完整视频。
      </p>
      <a href={props.downloadUrl} download={`${props.title}.mp4`}>
        <Button>📥 下载完整视频</Button>
      </a>
    </GlassCard>
  );
}
