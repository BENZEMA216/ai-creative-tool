'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Order {
  order_no: string;
  amount: number;
  qr_code_url: string;
  expire_at: string;
}

interface Props {
  order: Order;
  onClose: () => void;
  onPaid: () => void;
}

export function PaymentModal({ order, onClose, onPaid }: Props) {
  const [status, setStatus] = useState<'pending' | 'paid' | 'expired' | 'failed'>('pending');
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(order.expire_at).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/status/${order.order_no}`);
        const json = await res.json();
        if (json.code === 0) {
          setStatus(json.data.status);
          if (json.data.status === 'paid') onPaid();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [status, order.order_no, onPaid]);

  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <GlassCard className="w-full max-w-sm space-y-4 text-center">
        {status === 'pending' && (
          <>
            <h3 className="font-editorial text-xl text-white">微信扫码支付</h3>
            <div className="bg-white p-4 rounded-xl inline-block">
              <QRCodeSVG value={order.qr_code_url} size={200} />
            </div>
            <p className="text-sm text-white/70">订单号：{order.order_no}</p>
            <p className="text-2xl text-accent">¥ {order.amount}</p>
            <p className="text-xs text-white/50">
              剩余 {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} 自动过期
            </p>
            <p className="text-xs text-white/50">
              （MOCK_PAY=true 时，5 秒后自动模拟支付成功）
            </p>
            <Button variant="ghost" fullWidth onClick={onClose}>关闭</Button>
          </>
        )}
        {status === 'paid' && (
          <>
            <h3 className="font-editorial text-xl text-white">✅ 支付成功</h3>
            <p className="text-sm text-white/70">积分已到账</p>
            <Button fullWidth onClick={onClose}>完成</Button>
          </>
        )}
        {(status === 'expired' || status === 'failed') && (
          <>
            <h3 className="font-editorial text-xl text-white">订单 {status === 'expired' ? '已过期' : '失败'}</h3>
            <Button fullWidth onClick={onClose}>关闭</Button>
          </>
        )}
      </GlassCard>
    </div>
  );
}
