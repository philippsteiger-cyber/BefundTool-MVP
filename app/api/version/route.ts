import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: '0.7.5',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  });
}
