import { CorrectionEntry } from './types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applySingleCorrection(
  text: string,
  entry: CorrectionEntry
): string {
  const { wrong, correct, caseInsensitive, wholeWord } = entry;

  if (!wrong || wrong === correct) return text;

  const escapedWrong = escapeRegex(wrong);
  const pattern = wholeWord ? `\\b${escapedWrong}\\b` : escapedWrong;
  const flags = caseInsensitive ? 'gi' : 'g';

  try {
    const regex = new RegExp(pattern, flags);
    return text.replace(regex, correct);
  } catch {
    return text;
  }
}

export function applyCorrections(
  text: string,
  corrections: CorrectionEntry[]
): string {
  let result = text;

  for (const entry of corrections) {
    result = applySingleCorrection(result, entry);
  }

  return result;
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .trim();
}

export function processTranscriptText(
  text: string,
  corrections: CorrectionEntry[]
): string {
  let result = normalizeWhitespace(text);
  result = applyCorrections(result, corrections);
  return result;
}

export function capitalizeFirstLetter(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ensurePunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const lastChar = trimmed.charAt(trimmed.length - 1);
  if (/[.!?:;,]/.test(lastChar)) {
    return trimmed;
  }

  return trimmed + '.';
}
