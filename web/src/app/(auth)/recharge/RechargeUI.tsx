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
  qr_code_url?: string;
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

  // Poll pending H5 order on return from WeChat
  useEffect(() => {
    const pending = sessionStorage.getItem('pending_order');
    if (!pending) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/order/status/${pending}`);
        const json = await res.json();
        if (json.code === 0 && json.data.status === 'paid') {
          sessionStorage.removeItem('pending_order');
          alert('支付成功，积分已到账');
          router.refresh();
          return;
        }
        if (json.code === 0 && (json.data.status === 'expired' || json.data.status === 'failed')) {
          sessionStorage.removeItem('pending_order');
          return;
        }
      } catch {}
      if (!stopped) setTimeout(poll, 2000);
    };
    poll();
    return () => { stopped = true; };
  }, [router]);

  async function checkout() {
    setError(null);
    setBusy(true);
    try {
      const isMobile = typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent);

      const res = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          package_type: selected,
          method: isMobile ? 'h5' : 'native',
        }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }

      if (json.data.method === 'h5' && json.data.h5_url) {
        // Store order_no for return-to-poll tracking
        sessionStorage.setItem('pending_order', json.data.order_no);
        // Redirect to WeChat H5 pay
        window.location.href = json.data.h5_url;
      } else {
        // Native: existing modal flow
        setOrder(json.data);
      }
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
      {order && order.qr_code_url && (
        <PaymentModal
          order={{ ...order, qr_code_url: order.qr_code_url }}
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
