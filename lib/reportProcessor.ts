import { Template, TemplateScore } from './types';

export interface ProcessedReport {
  html: string;
  sections: {
    untersuchung: string;
    klinischeAngaben: string;
    technik: string;
    kontrastmittel: string;
    voruntersuchungen: string;
    befund: string;
    impression: string;
  };
}

export function scoreTemplate(template: Template, transcript: string): number {
  const lower = transcript.toLowerCase();
  let score = 0;

  for (const keyword of template.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

export function rankTemplates(templates: Template[], transcript: string): TemplateScore[] {
  const scores = templates.map((template) => {
    const score = scoreTemplate(template, transcript);
    let confidence: 'high' | 'medium' | 'low';

    if (score >= 3) {
      confidence = 'high';
    } else if (score === 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { template, score, confidence };
  });

  return scores.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
}

function splitIntoSentences(text: string): string[] {
  const sentences = text.split(/(?<=[.!?\n])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function processReport(
  transcript: string,
  template: Template,
  clinicalData: Record<string, string>
): ProcessedReport {
  const lowerTranscript = transcript.toLowerCase();
  const sentences = splitIntoSentences(transcript);

  const sections = {
    untersuchung: template.name || '',
    klinischeAngaben: clinicalData.klinischeAngaben || clinicalData.indication || '',
    technik: clinicalData.technik || '',
    kontrastmittel: clinicalData.kontrastmittel || '',
    voruntersuchungen: clinicalData.voruntersuchungen || '',
    befund: template.normalBefundText,
    impression: '',
  };

  const html = `
<div class="report-content">
  <p><strong>UNTERSUCHUNG:</strong><br/>${escapeHtml(sections.untersuchung)}</p>
  <p><strong>KLINISCHE ANGABEN:</strong><br/>${escapeHtml(sections.klinischeAngaben) || '-'}</p>
  <p><strong>TECHNIK:</strong><br/>${escapeHtml(sections.technik) || '-'}</p>
  <p><strong>KONTRASTMITTEL:</strong><br/>${escapeHtml(sections.kontrastmittel) || '-'}</p>
  <p><strong>VORUNTERSUCHUNGEN:</strong><br/>${escapeHtml(sections.voruntersuchungen) || '-'}</p>
  <p><strong>BEFUND:</strong></p>
  <div class="befund-content">${sections.befund.replace(/\n/g, '<br/>')}</div>
  <p><strong>IMPRESSION:</strong></p>
  <div class="impression-content">${sections.impression.replace(/\n/g, '<br/>') || '-'}</div>
</div>
  `.trim();

  return { html, sections };
}

export function stripHtmlForCopy(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  const marks = div.querySelectorAll('mark');
  marks.forEach((mark) => {
    const text = document.createTextNode(mark.textContent || '');
    mark.parentNode?.replaceChild(text, mark);
  });

  let text = div.innerText || div.textContent || '';
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
