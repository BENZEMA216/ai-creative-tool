'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PackageCard } from '@/components/features/PackageCard';
import { PaymentModal } from '@/components/features/PaymentModal';

interface PackageInfo {
  code: 'basic' | 'standard' | 'premium';
  name: string;
  yuan: number;
  points: number;
  badge: string | null;
}

interface Order {
  order_no: string;
  amount: number;
  points: number;
  qr_code_url: string;
  expire_at: string;
}

export function RechargeUI({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [selected, setSelected] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetch('/api/packages').then(r => r.json()).then(json => {
      if (json.code === 0) setPackages(json.data.packages);
    });
  }, []);

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
        {packages.map(p => (
          <PackageCard
            key={p.code}
            type={p.code}
            yuan={p.yuan}
            points={p.points}
            badge={p.badge ?? undefined}
            selected={selected === p.code}
            onClick={() => setSelected(p.code)}
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
