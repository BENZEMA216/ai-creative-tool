import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/services/health-service';

export async function GET() {
  const result = await checkHealth();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
