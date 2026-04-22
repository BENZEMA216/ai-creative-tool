import type { ZodType } from 'zod';
import { AppError, ErrCode } from '@/lib/domain/errors';

/**
 * 解析 JSON body 并用 zod schema 校验。失败抛 AppError 让 errorBoundary 捕获。
 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(ErrCode.InternalError, '请求体必须是 JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');
  }
  return parsed.data;
}
