import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient, protos } from '@google-cloud/speech';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RecognitionConfig = protos.google.cloud.speech.v1.IRecognitionConfig;
type SpeechContext = protos.google.cloud.speech.v1.ISpeechContext;

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

function getCredentials(): { projectId: string; credentials: { client_email: string; private_key: string } } | null {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!projectId || !serviceAccountJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(serviceAccountJson);
    return {
      projectId,
      credentials: {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key),
      },
    };
  } catch {
    return null;
  }
}

async function transcribeAudio(
  audioBase64: string,
  hints: string[],
  language: string,
  withAdaptation: boolean = true
): Promise<string> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error('Google Cloud credentials not configured');
  }

  const client = new SpeechClient({
    projectId: creds.projectId,
    credentials: creds.credentials,
  });

  const config: RecognitionConfig = {
    encoding: 'WEBM_OPUS' as const,
    sampleRateHertz: 48000,
    languageCode: language,
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  };

  if (withAdaptation && hints.length > 0) {
    const speechContext: SpeechContext = {
      phrases: hints.slice(0, 500),
      boost: 10,
    };
    config.speechContexts = [speechContext];
  }

  const request = {
    config,
    audio: {
      content: audioBase64,
    },
  };

  const [response] = await client.recognize(request);

  let transcript = '';
  if (response.results) {
    for (const result of response.results) {
      if (result.alternatives && result.alternatives.length > 0) {
        transcript += result.alternatives[0].transcript + ' ';
      }
    }
  }

  return transcript.trim();
}

export async function POST(request: NextRequest) {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: { message: 'GOOGLE_CLOUD_PROJECT_ID not configured', name: 'ConfigError' }, transcript: '' },
        { status: 500 }
      );
    }

    if (!serviceAccountJson) {
      return NextResponse.json(
        { ok: false, error: { message: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured', name: 'ConfigError' }, transcript: '' },
        { status: 500 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: { message: 'Invalid form data', name: 'ValidationError' }, transcript: '' },
        { status: 400 }
      );
    }

    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) {
      return NextResponse.json(
        { ok: false, error: { message: 'No audio file provided', name: 'ValidationError' }, transcript: '' },
        { status: 400 }
      );
    }

    const hintsJson = formData.get('hints') as string | null;
    const language = (formData.get('language') as string) || 'de-CH';

    let hints: string[] = [];
    if (hintsJson) {
      try {
        hints = JSON.parse(hintsJson);
      } catch {
        hints = [];
      }
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    let transcript = '';
    try {
      transcript = await transcribeAudio(audioBase64, hints, language, true);
    } catch (error) {
      console.warn('ASR with adaptation failed, retrying without:', error);
      try {
        transcript = await transcribeAudio(audioBase64, hints, language, false);
      } catch (retryError) {
        const errMsg = retryError instanceof Error ? retryError.message : 'Unknown error';
        return NextResponse.json(
          { ok: false, error: { message: `Transcription failed: ${errMsg}`, name: 'ASRError' }, transcript: '' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, transcript });
  } catch (error) {
    console.error('ASR route error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';
    return NextResponse.json(
      { ok: false, error: { message: errMsg, name: errName }, transcript: '' },
      { status: 500 }
    );
  }
}
