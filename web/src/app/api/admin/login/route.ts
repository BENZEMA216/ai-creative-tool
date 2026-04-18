import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { signAdminToken } from '@/lib/core/auth';
import { ADMIN_COOKIE } from '@/lib/middleware/with-admin-auth';

const COOKIE_MAX_AGE = 12 * 60 * 60;

const reqSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
  const { username, password } = parsed.data;

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) return err(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return err(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const token = await signAdminToken({ aid: admin.id, username: admin.username, role: admin.role });

  const res = ok({
    token,
    username: admin.username,
    role: admin.role,
    must_change_password: admin.mustChangePassword,
  }, '登录成功');

  res.headers.append(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
}
