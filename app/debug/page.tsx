'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface EnvStatus {
  ok: boolean;
  env?: {
    GOOGLE_CLOUD_PROJECT_ID: {
      present: boolean;
      value: string | null;
    };
    GOOGLE_SERVICE_ACCOUNT_JSON: {
      present: boolean;
      valid: boolean;
      clientEmail: string | null;
    };
    OPENAI_API_KEY: {
      present: boolean;
      prefix: string | null;
    };
  };
  nodeEnv?: string;
  error?: { message: string };
}

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'error' }) {
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'warning') return <AlertCircle className="h-5 w-5 text-amber-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

export default function DebugPage() {
  const [status, setStatus] = useState<EnvStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [asrTestResult, setAsrTestResult] = useState<string | null>(null);
  const [reportTestResult, setReportTestResult] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/debug');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ ok: false, error: { message: err instanceof Error ? err.message : 'Failed to fetch' } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const testASR = async () => {
    setAsrTestResult('Testing...');
    try {
      const formData = new FormData();
      const silentBlob = new Blob([new ArrayBuffer(1000)], { type: 'audio/webm' });
      formData.append('audio', silentBlob, 'test.webm');
      formData.append('language', 'de-CH');

      const res = await fetch('/api/asr', { method: 'POST', body: formData });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setAsrTestResult(`Invalid JSON: ${text.slice(0, 100)}`);
        return;
      }

      if (data.ok) {
        setAsrTestResult(`OK - Transcript: "${data.transcript || '(empty)'}"`);
      } else {
        setAsrTestResult(`Error: ${data.error?.message || 'Unknown'}`);
      }
    } catch (err) {
      setAsrTestResult(`Network error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const testReport = async () => {
    setReportTestResult('Testing...');
    try {
      const res = await fetch('/api/process-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyName: 'CT Abdomen Test',
          templateName: 'Test Template',
          normalBefundText: 'Normalbefund.',
          clinicalData: { indication: 'Test' },
          transcriptText: 'Leber unauffällig.',
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setReportTestResult(`Invalid JSON: ${text.slice(0, 100)}`);
        return;
      }

      if (data.ok) {
        const preview = data.finalReportHtml?.slice(0, 80) || '(empty)';
        const fallbackNote = data.usedFallback ? ` (Fallback: ${data.note})` : '';
        setReportTestResult(`OK - HTML: "${preview}..."${fallbackNote}`);
      } else {
        setReportTestResult(`Error: ${data.error?.message || 'Unknown'}`);
      }
    } catch (err) {
      setReportTestResult(`Network error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!status?.ok && status?.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-sm border max-w-md text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold mb-2">Debug Unavailable</h1>
          <p className="text-gray-600 mb-4">{status.error.message}</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to App
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const env = status?.env;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Environment Debug</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchStatus}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Environment Variables</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded">
              <StatusIcon status={env?.GOOGLE_CLOUD_PROJECT_ID.present ? 'ok' : 'error'} />
              <div className="flex-1">
                <div className="font-medium">GOOGLE_CLOUD_PROJECT_ID</div>
                <div className="text-sm text-gray-600">
                  {env?.GOOGLE_CLOUD_PROJECT_ID.present
                    ? `Present: ${env.GOOGLE_CLOUD_PROJECT_ID.value}`
                    : 'Missing - Required for Google Cloud Speech API'}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded">
              <StatusIcon
                status={
                  env?.GOOGLE_SERVICE_ACCOUNT_JSON.present && env?.GOOGLE_SERVICE_ACCOUNT_JSON.valid
                    ? 'ok'
                    : env?.GOOGLE_SERVICE_ACCOUNT_JSON.present
                    ? 'warning'
                    : 'error'
                }
              />
              <div className="flex-1">
                <div className="font-medium">GOOGLE_SERVICE_ACCOUNT_JSON</div>
                <div className="text-sm text-gray-600">
                  {env?.GOOGLE_SERVICE_ACCOUNT_JSON.present ? (
                    env?.GOOGLE_SERVICE_ACCOUNT_JSON.valid ? (
                      <>Present and valid. Client: {env.GOOGLE_SERVICE_ACCOUNT_JSON.clientEmail}</>
                    ) : (
                      'Present but invalid JSON structure'
                    )
                  ) : (
                    'Missing - Required for Google Cloud Speech API'
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded">
              <StatusIcon status={env?.OPENAI_API_KEY.present ? 'ok' : 'warning'} />
              <div className="flex-1">
                <div className="font-medium">OPENAI_API_KEY</div>
                <div className="text-sm text-gray-600">
                  {env?.OPENAI_API_KEY.present
                    ? `Present: ${env.OPENAI_API_KEY.prefix}`
                    : 'Missing - Report generation will use fallback'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="text-sm text-gray-500">
              Node Environment: <code className="bg-gray-100 px-1 rounded">{status?.nodeEnv}</code>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">API Tests</h2>

          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">/api/asr</span>
                <Button size="sm" onClick={testASR}>
                  Test ASR
                </Button>
              </div>
              {asrTestResult && (
                <div className={`text-sm p-2 rounded ${asrTestResult.startsWith('OK') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {asrTestResult}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">/api/process-report</span>
                <Button size="sm" onClick={testReport}>
                  Test Report
                </Button>
              </div>
              {reportTestResult && (
                <div className={`text-sm p-2 rounded ${reportTestResult.startsWith('OK') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {reportTestResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
