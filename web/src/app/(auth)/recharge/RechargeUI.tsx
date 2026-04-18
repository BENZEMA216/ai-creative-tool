'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PackageCard } from '@/components/features/PackageCard';
import { PaymentModal } from '@/components/features/PaymentModal';

const PACKAGES = [
  { type: 'basic', yuan: 19.9, points: 2000 },
  { type: 'standard', yuan: 39.9, points: 5000, badge: '多送 25%' },
  { type: 'premium', yuan: 99.9, points: 12000, badge: '多送 20%' },
] as const;

interface Order {
  order_no: string;
  amount: number;
  points: number;
  qr_code_url: string;
  expire_at: string;
}

export function RechargeUI({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  async function checkout() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package_type: selected }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      setOrder(json.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-white/70">当前积分：🪙 {initialPoints.toLocaleString()}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PACKAGES.map(p => (
          <PackageCard
            key={p.type}
            type={p.type}
            yuan={p.yuan}
            points={p.points}
            badge={(p as { badge?: string }).badge}
            selected={selected === p.type}
            onClick={() => setSelected(p.type)}
          />
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button fullWidth loading={busy} onClick={checkout}>
        微信支付
      </Button>
      {order && (
        <PaymentModal
          order={order}
          onClose={() => {
            setOrder(null);
            router.refresh();
          }}
          onPaid={() => router.refresh()}
        />
      )}
    </div>
  );
}
