import { ErrCode, AppError } from '@/lib/core/errors';
import { err } from '@/lib/core/http';
import type { Handler, Middleware } from './compose';

/**
 * 统一错误边界。
 * - AppError → 用其 code + message
 * - Error → 9000 InternalError + message
 * - 未知 → 9000 + '未知错误'
 *
 * 可选 onError 回调用于日志 / 失败 usage 记录等副作用。
 */
export interface ErrorBoundaryOpts {
  onError?: (req: Request, e: unknown) => Promise<void>;
}

export function withErrorBoundary(opts: ErrorBoundaryOpts = {}): Middleware {
  return (handler: Handler): Handler => async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (opts.onError) {
        try { await opts.onError(req, e); } catch {}
      }
      if (e instanceof AppError) {
        return err(e.code, e.message);
      }
      if (e instanceof Error) {
        console.error('[error-boundary]', e.stack ?? e.message);
        return err(ErrCode.InternalError, e.message);
      }
      console.error('[error-boundary] unknown:', e);
      return err(ErrCode.InternalError, '服务器内部错误');
    }
  };
}
