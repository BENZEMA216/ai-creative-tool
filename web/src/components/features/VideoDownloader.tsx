'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VideoTrimmer } from './VideoTrimmer';

interface Result {
  title: string;
  platform: string;
  duration: number;
  duration_text: string;
  thumbnail: string;
  download_url: string;
  points_remaining: number;
}

const POINTS = 20;

export function VideoDownloader({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [points, setPoints] = useState(initialPoints);

  async function submit() {
    setError(null);
    setResult(null);
    if (points < POINTS) {
      setError('积分不足，请充值');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/video/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: url }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      setResult(json.data);
      setPoints(json.data.points_remaining);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4">
        <p className="text-sm text-white/70">请粘贴短视频链接</p>
        <Input
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <p className="text-sm text-accent">⚡ 本次操作将消耗 <span className="font-medium">{POINTS}</span> 积分</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button fullWidth loading={loading} disabled={!url} onClick={submit}>
          🔍 解析视频
        </Button>
      </GlassCard>
      {result && (
        <VideoTrimmer
          title={result.title}
          platform={result.platform}
          durationText={result.duration_text}
          duration={result.duration}
          thumbnail={result.thumbnail}
          downloadUrl={result.download_url}
        />
      )}
    </div>
  );
}
