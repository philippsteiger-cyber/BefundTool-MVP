import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = !!process.env.OPENAI_API_KEY;
  const model = 'gpt-5-mini';

  return NextResponse.json({ configured, model });
}
