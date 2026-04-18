'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { TextExtractor } from '@/components/features/TextExtractor';
import { VideoDownloader } from '@/components/features/VideoDownloader';

type Tab = 'extract' | 'download';

export function DashboardTabs({ initialPoints }: { initialPoints: number }) {
  const [tab, setTab] = useState<Tab>('extract');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {(['extract', 'download'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm transition-colors',
              tab === t ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
            )}
          >
            {t === 'extract' ? '📝 文案提取' : '📥 视频下载'}
          </button>
        ))}
      </div>
      {tab === 'extract' ? (
        <TextExtractor initialPoints={initialPoints} />
      ) : (
        <VideoDownloader initialPoints={initialPoints} />
      )}
    </div>
  );
}
