interface DiffSegment {
  text: string;
  isHighlight: boolean;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+|[.,;:!?])/g).filter(t => t.length > 0);
}

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

function computeDiff(baseline: string[], revised: string[]): DiffSegment[] {
  const dp = longestCommonSubsequence(baseline, revised);
  const segments: DiffSegment[] = [];

  let i = baseline.length;
  let j = revised.length;

  const result: Array<{ type: 'common' | 'added' | 'removed'; text: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && baseline[i - 1] === revised[j - 1]) {
      result.unshift({ type: 'common', text: baseline[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: revised[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'removed', text: baseline[i - 1] });
      i--;
    }
  }

  let currentSegment = '';
  let isCurrentHighlight = false;

  for (const item of result) {
    if (item.type === 'removed') {
      continue;
    }

    const shouldHighlight = item.type === 'added';

    if (isCurrentHighlight !== shouldHighlight && currentSegment) {
      segments.push({ text: currentSegment, isHighlight: isCurrentHighlight });
      currentSegment = '';
    }

    currentSegment += item.text;
    isCurrentHighlight = shouldHighlight;
  }

  if (currentSegment) {
    segments.push({ text: currentSegment, isHighlight: isCurrentHighlight });
  }

  return segments;
}

export function highlightDifferences(baselineText: string, revisedText: string): string {
  if (!baselineText || !revisedText) {
    return revisedText;
  }

  const baselineTokens = tokenize(baselineText);
  const revisedTokens = tokenize(revisedText);

  const segments = computeDiff(baselineTokens, revisedTokens);

  let html = '';
  for (const segment of segments) {
    if (segment.isHighlight) {
      html += `<mark class="hl" data-src="transcript">${escapeHtml(segment.text)}</mark>`;
    } else {
      html += escapeHtml(segment.text);
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
