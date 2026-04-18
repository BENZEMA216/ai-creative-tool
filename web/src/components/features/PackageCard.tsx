'use client';

import { clsx } from 'clsx';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  type: 'basic' | 'standard' | 'premium';
  yuan: number;
  points: number;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}

const ICONS = { basic: '🔥', standard: '⭐', premium: '👑' };
const NAMES = { basic: '基础', standard: '标准', premium: '尊享' };

export function PackageCard({ type, yuan, points, badge, selected, onClick }: Props) {
  return (
    <button onClick={onClick} className="text-left">
      <GlassCard
        className={clsx(
          'space-y-3 transition-all',
          selected ? 'border-accent bg-white/10' : 'hover:bg-white/8'
        )}
      >
        <div className="flex items-center gap-2 text-lg text-white">
          <span>{ICONS[type]}</span>
          <span>{NAMES[type]}</span>
        </div>
        <div className="text-3xl font-editorial text-white">{points.toLocaleString()}</div>
        <div className="text-sm text-white/60">积分</div>
        <div className="text-2xl font-medium text-accent">¥ {yuan}</div>
        {badge && <div className="text-xs text-accent/80">{badge}</div>}
      </GlassCard>
    </button>
  );
}
