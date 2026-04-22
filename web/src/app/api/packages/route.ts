import { NextResponse } from 'next/server';
import { listActivePackages } from '@/lib/domain/packages';

export const dynamic = 'force-dynamic';

export async function GET() {
  const packages = await listActivePackages();
  return NextResponse.json({ code: 0, message: 'ok', data: { packages } });
}
