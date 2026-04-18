'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function sendCode() {
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入有效的手机号');
      return;
    }
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setError(json.message);
      return;
    }
    setCountdown(60);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        prefix="🇨🇳 +86"
        placeholder="请输入手机号"
        value={phone}
        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
        inputMode="numeric"
      />
      <div className="flex gap-2">
        <Input
          placeholder="请输入验证码"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          className="flex-1"
        />
        <Button
          variant="ghost"
          disabled={countdown > 0 || phone.length !== 11}
          onClick={sendCode}
          className="whitespace-nowrap"
        >
          {countdown > 0 ? `${countdown}s` : '获取验证码'}
        </Button>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <Button
        fullWidth
        loading={submitting}
        disabled={phone.length !== 11 || code.length !== 6}
        onClick={submit}
      >
        登录 / 注册
      </Button>
    </div>
  );
}
