import { NextResponse } from 'next/server';

export type Handler = (req: Request, ctx?: { params: Record<string, string> }) => Promise<NextResponse>;
export type Middleware = (handler: Handler) => Handler;

/**
 * 从右到左组合中间件。
 * compose(a, b, c)(handler) = a(b(c(handler)))
 * 请求时的包装顺序：a 先跑 → b 跑 → c 跑 → handler
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return (handler) => middlewares.reduceRight((h, mw) => mw(h), handler);
}
