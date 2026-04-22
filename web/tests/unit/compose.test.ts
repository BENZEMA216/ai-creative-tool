import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { compose, type Middleware } from '@/lib/http/compose';

describe('compose', () => {
  it('applies middleware right-to-left (a outermost)', async () => {
    const trace: string[] = [];

    const a: Middleware = (h) => async (req, ctx) => {
      trace.push('a-before');
      const r = await h(req, ctx);
      trace.push('a-after');
      return r;
    };
    const b: Middleware = (h) => async (req, ctx) => {
      trace.push('b-before');
      const r = await h(req, ctx);
      trace.push('b-after');
      return r;
    };

    const handler = compose(a, b)(async () => {
      trace.push('handler');
      return NextResponse.json({ ok: true });
    });

    await handler(new Request('http://x'));
    expect(trace).toEqual(['a-before', 'b-before', 'handler', 'b-after', 'a-after']);
  });

  it('compose() with no middlewares returns handler unchanged', async () => {
    const h = async () => NextResponse.json({ v: 1 });
    const wrapped = compose()(h);
    const res = await wrapped(new Request('http://x'));
    expect(await res.json()).toEqual({ v: 1 });
  });
});
