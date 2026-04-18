'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  duration: string;
  text?: string;
  downloadUrl?: string;
}

export function ResultPanel({ title, platform, duration, text, downloadUrl }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{duration}</span></div>
      </div>
      {text && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/90 whitespace-pre-wrap max-h-96 overflow-auto">
            {text}
          </div>
          <Button variant="ghost" onClick={copy}>{copied ? '✅ 已复制' : '📋 复制文案'}</Button>
        </>
      )}
      {downloadUrl && (
        <a href={downloadUrl} download className="inline-block">
          <Button>📥 下载完整视频</Button>
        </a>
      )}
    </GlassCard>
  );
}
