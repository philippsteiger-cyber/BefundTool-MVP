'use client';

import { useState, useRef, useCallback } from 'react';

type RecordingState = 'idle' | 'recording' | 'uploading';

interface ASRError {
  message: string;
  name: string;
}

interface Replacement {
  from: string;
  to: string;
  caseInsensitive?: boolean;
  wholeWord?: boolean;
}

interface UseRecordingOptions {
  onTranscriptReady?: (text: string) => void;
  onError?: (error: ASRError) => void;
  hints?: string[];
  replacements?: Replacement[];
  language?: string;
}

const SPOKEN_PUNCTUATION: Record<string, string> = {
  'punkt': '.',
  'komma': ',',
  'fragezeichen': '?',
  'ausrufezeichen': '!',
  'doppelpunkt': ':',
  'semikolon': ';',
  'strichpunkt': ';',
  'bindestrich': '-',
  'gedankenstrich': ' - ',
  'klammer auf': '(',
  'klammer zu': ')',
  'anführungszeichen': '"',
  'neue zeile': '\n',
  'neuer absatz': '\n\n',
  'absatz': '\n\n',
};

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([.,;:!?])/g, '$1')
    .trim();
}

function replaceSpokenPunctuation(text: string): string {
  let result = text;
  for (const [spoken, punctuation] of Object.entries(SPOKEN_PUNCTUATION)) {
    const regex = new RegExp(`\\b${spoken}\\b`, 'gi');
    result = result.replace(regex, punctuation);
  }
  return result;
}

function applyReplacements(text: string, replacements: Replacement[]): string {
  let result = text;
  for (const r of replacements) {
    if (!r.from) continue;
    const flags = r.caseInsensitive ? 'gi' : 'g';
    const pattern = r.wholeWord
      ? `\\b${escapeRegex(r.from)}\\b`
      : escapeRegex(r.from);
    const regex = new RegExp(pattern, flags);
    result = result.replace(regex, r.to);
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processTranscript(
  rawText: string,
  replacements: Replacement[]
): string {
  let text = rawText;
  text = normalizeWhitespace(text);
  text = replaceSpokenPunctuation(text);
  text = applyReplacements(text, replacements);
  text = normalizeWhitespace(text);
  return text;
}

async function safeFetchASR(formData: FormData): Promise<{ ok: boolean; transcript: string; error?: ASRError }> {
  try {
    const response = await fetch('/api/asr', {
      method: 'POST',
      body: formData,
    });

    const resText = await response.text();

    if (!resText || resText.trim() === '') {
      return {
        ok: false,
        transcript: '',
        error: { message: `Empty response from server (status: ${response.status})`, name: 'EmptyResponseError' }
      };
    }

    let data;
    try {
      data = JSON.parse(resText);
    } catch {
      return {
        ok: false,
        transcript: '',
        error: {
          message: `Invalid JSON response (status: ${response.status}): ${resText.slice(0, 200)}`,
          name: 'JSONParseError'
        }
      };
    }

    if (!response.ok || data.ok === false) {
      return {
        ok: false,
        transcript: '',
        error: data.error || { message: `Server error: ${response.status}`, name: 'ServerError' }
      };
    }

    return { ok: true, transcript: data.transcript || '' };
  } catch (err) {
    return {
      ok: false,
      transcript: '',
      error: {
        message: err instanceof Error ? err.message : 'Network error',
        name: err instanceof Error ? err.name : 'NetworkError'
      }
    };
  }
}

function getSupportedMimeType(): string | null {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

export function useRecording(options: UseRecordingOptions = {}) {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<ASRError | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const checkSupport = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    if (!window.MediaRecorder) return false;
    const mimeType = getSupportedMimeType();
    const supported = mimeType !== null;
    setIsSupported(supported);
    return supported;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!checkSupport()) {
      const asrError: ASRError = {
        message: 'Browser unterstützt Aufnahmeformat nicht - bitte Chrome verwenden.',
        name: 'UnsupportedError'
      };
      setError(asrError);
      options.onError?.(asrError);
      return;
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      const asrError: ASRError = {
        message: 'Kein unterstütztes Audioformat gefunden.',
        name: 'UnsupportedError'
      };
      setError(asrError);
      options.onError?.(asrError);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setState('uploading');

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('hints', JSON.stringify(options.hints || []));
        formData.append('language', options.language || 'de-CH');

        const result = await safeFetchASR(formData);

        if (result.ok && result.transcript) {
          const replacements: Replacement[] = (options.replacements || []).map(r => ({
            from: r.from,
            to: r.to,
            caseInsensitive: r.caseInsensitive,
            wholeWord: r.wholeWord,
          }));

          const processedText = processTranscript(result.transcript, replacements);
          options.onTranscriptReady?.(processedText);
          setError(null);
        } else if (result.error) {
          setError(result.error);
          options.onError?.(result.error);
        }

        setState('idle');
      };

      mediaRecorder.start();
      setState('recording');
    } catch (err) {
      const asrError: ASRError = {
        message: err instanceof Error ? err.message : 'Could not start recording',
        name: err instanceof Error ? err.name : 'RecordingError'
      };
      setError(asrError);
      options.onError?.(asrError);
      setState('idle');
    }
  }, [options, checkSupport]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [state]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isRecording: state === 'recording',
    isUploading: state === 'uploading',
    isSupported: isSupported ?? checkSupport(),
    error,
    startRecording,
    stopRecording,
    clearError,
  };
}
