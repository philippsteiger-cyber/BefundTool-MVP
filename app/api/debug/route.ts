import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev) {
    return NextResponse.json(
      { ok: false, error: { message: 'Debug endpoint only available in development', name: 'Forbidden' } },
      { status: 403 }
    );
  }

  const googleProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const googleServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const openaiKey = process.env.OPENAI_API_KEY;

  let googleServiceAccountValid = false;
  let googleClientEmail = '';

  if (googleServiceAccount) {
    try {
      const parsed = JSON.parse(googleServiceAccount);
      googleServiceAccountValid = !!(parsed.client_email && parsed.private_key);
      googleClientEmail = parsed.client_email ? `${parsed.client_email.slice(0, 10)}...` : '';
    } catch {
      googleServiceAccountValid = false;
    }
  }

  return NextResponse.json({
    ok: true,
    env: {
      GOOGLE_CLOUD_PROJECT_ID: {
        present: !!googleProjectId,
        value: googleProjectId ? `${googleProjectId.slice(0, 8)}...` : null,
      },
      GOOGLE_SERVICE_ACCOUNT_JSON: {
        present: !!googleServiceAccount,
        valid: googleServiceAccountValid,
        clientEmail: googleClientEmail || null,
      },
      OPENAI_API_KEY: {
        present: !!openaiKey,
        prefix: openaiKey ? `${openaiKey.slice(0, 7)}...` : null,
      },
    },
    nodeEnv: process.env.NODE_ENV,
  });
}
