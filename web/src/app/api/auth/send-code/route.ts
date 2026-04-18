import type { NextRequest } from 'next/server';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { rateLimit } from '@/lib/core/rate-limit';
import { sendCodeSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { getSmsClient } from '@/lib/clients/sms';
import { randomInt } from 'node:crypto';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(ErrCode.InternalError, '请求体必须是 JSON');
  }

  const parsed = sendCodeSchema.safeParse(body);
  if (!parsed.success) {
    return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');
  }

  const { phone } = parsed.data;

  // 1 次/60 秒/phone
  const allowed = await rateLimit(`sms:${phone}`, 1, 60);
  if (!allowed) return err(ErrCode.SmsSendFailed, '请求过于频繁，请 60 秒后再试');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiredAt = new Date(Date.now() + 300_000);

  await prisma.smsCode.create({
    data: { phone, code, purpose: 'login', expiredAt },
  });

  try {
    await getSmsClient().sendCode(phone, code, 'login');
  } catch (e) {
    const msg = e instanceof AppError ? e.message : '短信发送失败';
    return err(ErrCode.SmsSendFailed, msg);
  }

  return ok({ expire_in: 300 }, '验证码已发送');
}
