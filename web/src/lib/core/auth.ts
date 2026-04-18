import { SignJWT, jwtVerify } from 'jose';

export interface UserTokenPayload {
  uid: string;       // db user.id (UUID)
  userId: string;    // public AC + 8 digits
}

const ALG = 'HS256';

function getUserSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set and >= 32 chars');
  return new TextEncoder().encode(s);
}

function getAdminSecret(): Uint8Array {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_JWT_SECRET must be set and >= 32 chars');
  return new TextEncoder().encode(s);
}

export async function signUserToken(payload: UserTokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? '7d')
    .sign(getUserSecret());
}

export async function verifyUserToken(token: string): Promise<UserTokenPayload> {
  const { payload } = await jwtVerify(token, getUserSecret(), { algorithms: [ALG] });
  return { uid: payload.uid as string, userId: payload.userId as string };
}

export interface AdminTokenPayload {
  aid: number;
  username: string;
  role: 'admin' | 'super_admin';
}

export async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getAdminSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload> {
  const { payload } = await jwtVerify(token, getAdminSecret(), { algorithms: [ALG] });
  return { aid: payload.aid as number, username: payload.username as string, role: payload.role as 'admin' | 'super_admin' };
}
