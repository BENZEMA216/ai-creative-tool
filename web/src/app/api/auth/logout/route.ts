import { ok } from '@/lib/core/http';

export async function POST(_req: Request) {
  const res = ok({ logged_out: true });
  res.headers.append(
    'Set-Cookie',
    'auth-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  );
  return res;
}
