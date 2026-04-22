import { NextResponse } from 'next/server';
import { ErrCode } from '@/lib/domain/errors';

export function ok<T>(data: T, message = 'success') {
  return NextResponse.json({ code: 0, message, data });
}

export function err(code: ErrCode, message: string) {
  const status = httpStatusFor(code);
  return NextResponse.json({ code, message, data: null }, { status });
}

function httpStatusFor(code: ErrCode): number {
  if (code === 0) return 200;
  if (code >= 1001 && code <= 1003) return 401;
  if (code === 1004) return 403;
  if (code >= 9000) return 500;
  return 200; // 业务错误（用户能修正）依然 200，靠 code 区分
}
