import { NextRequest, NextResponse } from 'next/server';
import { highlightDifferences } from '@/lib/diffHighlight';

export const runtime = 'edge';

interface GenerateReportRequest {
  templateName: string;
  normalBefundText: string;
  clinicalData: Record<string, string>;
  transcriptText: string;
  modelMode?: 'standard' | 'expert';
}

interface GenerateReportResponse {
  ok: boolean;
  finalReportHtml: string;
  impressionText?: string;
  usedFallback?: boolean;
  error?: { name: string; message: string };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateFallbackReport(
  templateName: string,
  normalBefundText: string,
  clinicalData: Record<string, string>,
  transcriptText: string
): { finalReportHtml: string; impressionText: string } {
  const klinischeAngaben = clinicalData.klinischeAngaben || clinicalData.indication || '';
  const technik = clinicalData.technik || '';
  const kontrastmittel = clinicalData.kontrastmittel || '';
  const voruntersuchungen = clinicalData.voruntersuchungen || '';

  let befundText = normalBefundText || '';

  if (transcriptText) {
    befundText = befundText ? befundText + '\n\n' + transcriptText : transcriptText;
  }

  let html = '<div class="report-content">\n';
  html += `<p><strong>Untersuchung</strong><br/>${escapeHtml(templateName)}</p>\n`;

  if (klinischeAngaben) {
    html += `<p><strong>Klinische Angaben</strong><br/>${escapeHtml(klinischeAngaben)}</p>\n`;
  }

  if (technik) {
    html += `<p><strong>Technik</strong><br/>${escapeHtml(technik)}</p>\n`;
  }

  if (kontrastmittel) {
    html += `<p><strong>Kontrastmittel</strong><br/>${escapeHtml(kontrastmittel)}</p>\n`;
  }

  html += '<p><strong>Befund</strong></p>\n';
  html += '<div class="befund-content">\n';

  if (voruntersuchungen) {
    html += escapeHtml(voruntersuchungen) + '<br/><br/>\n';
  } else {
    html += 'Keine Voruntersuchungen zum Vergleich vorliegend.<br/><br/>\n';
  }

  if (befundText) {
    html += befundText.replace(/\n/g, '<br/>') + '\n';
  }

  html += '</div>\n';

  html += '<p><strong>Beurteilung</strong></p>\n';
  html += '<div class="impression-content">• Beurteilung gemäss Befund.</div>\n';
  html += '</div>';

  return { finalReportHtml: html, impressionText: '• Beurteilung gemäss Befund.' };
}

async function generateReportSinglePass(
  normalBefundText: string,
  transcriptText: string,
  clinicalData: Record<string, string>,
  modelMode: 'standard' | 'expert' = 'standard'
): Promise<{ revisedBefundText: string; beurteilungText: string }> {
  const klinischeAngaben = clinicalData.klinischeAngaben || clinicalData.indication || '';

  const systemPrompt = `You are a radiology assistant. Generate a complete medical report with both BEFUND and BEURTEILUNG sections.

CRITICAL RULES:
1. Template-first merge: Start with the baseline BEFUND text as source of truth
2. If transcript indicates pathology, REWRITE the relevant baseline sentence(s) - do NOT append
3. Merge transcript findings naturally into the baseline text
4. Do NOT create "Aus dem Transkript" sections
5. Use Swiss German medical terminology
6. Keep text concise and professional

BEURTEILUNG RULES:
1. ALWAYS provide a Beurteilung (never omit)
2. Use 1–5 bullet points (start each with •)
3. Base assessment ONLY on the Befund + Klinische Angaben
4. No speculative recommendations unless explicitly supported
5. Conservative radiology wording
6. If insufficient information: "• Beurteilung gemäss Befund."

Return STRICT JSON with this exact structure:
{
  "revisedBefundText": "your merged befund text here",
  "beurteilungText": "• bullet 1\\n• bullet 2"
}`;

  const userPrompt = `Baseline BEFUND:
${normalBefundText || '(keine Vorlage)'}

Klinische Angaben: ${klinischeAngaben || '-'}

Transcript findings:
${transcriptText || '(leer)'}

Generate the complete report (revised BEFUND + BEURTEILUNG) in strict JSON format.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const modelToUse = modelMode === 'expert' ? 'o1-mini' : 'gpt-4o-mini';

  const messages = modelMode === 'expert'
    ? [
        {
          role: 'user' as const,
          content: systemPrompt + '\n\n' + userPrompt
        }
      ]
    : [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];

  const requestBody: any = {
    model: modelToUse,
    messages: messages,
  };

  if (modelMode !== 'expert') {
    requestBody.response_format = { type: 'json_object' };
    requestBody.max_completion_tokens = 2500;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '';

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  const parsed = JSON.parse(content);

  if (!parsed.revisedBefundText || !parsed.beurteilungText) {
    throw new Error('Missing required fields in LLM response');
  }

  return {
    revisedBefundText: parsed.revisedBefundText,
    beurteilungText: parsed.beurteilungText,
  };
}

function buildFinalReportHtml(
  templateName: string,
  clinicalData: Record<string, string>,
  normalBefundText: string,
  revisedBefundText: string,
  beurteilungText: string
): string {
  const klinischeAngaben = clinicalData.klinischeAngaben || clinicalData.indication || '';
  const technik = clinicalData.technik || '';
  const kontrastmittel = clinicalData.kontrastmittel || '';
  const voruntersuchungen = clinicalData.voruntersuchungen || '';

  let befundHtml = '';

  if (voruntersuchungen) {
    befundHtml += escapeHtml(voruntersuchungen) + '<br/><br/>';
  } else {
    befundHtml += 'Keine Voruntersuchungen zum Vergleich vorliegend.<br/><br/>';
  }

  befundHtml += highlightDifferences(normalBefundText, revisedBefundText);

  let html = '<div class="report-content">\n';
  html += `<p><strong>Untersuchung</strong><br/>${escapeHtml(templateName)}</p>\n`;

  if (klinischeAngaben) {
    html += `<p><strong>Klinische Angaben</strong><br/>${escapeHtml(klinischeAngaben)}</p>\n`;
  }

  if (technik) {
    html += `<p><strong>Technik</strong><br/>${escapeHtml(technik)}</p>\n`;
  }

  if (kontrastmittel) {
    html += `<p><strong>Kontrastmittel</strong><br/>${escapeHtml(kontrastmittel)}</p>\n`;
  }

  html += '<p><strong>Befund</strong></p>\n';
  html += `<div class="befund-content">${befundHtml}</div>\n`;

  html += '<p><strong>Beurteilung</strong></p>\n';
  html += `<div class="impression-content">${escapeHtml(beurteilungText).replace(/\n/g, '<br/>')}</div>\n`;

  html += '</div>';

  return html;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateReportRequest = await req.json();
    const { templateName, normalBefundText, clinicalData, transcriptText, modelMode = 'standard' } = body;

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const fallback = generateFallbackReport(templateName, normalBefundText, clinicalData, transcriptText);
      return NextResponse.json({
        ok: true,
        finalReportHtml: fallback.finalReportHtml,
        impressionText: fallback.impressionText,
        usedFallback: true,
        error: { name: 'ConfigError', message: 'OPENAI_API_KEY not configured' },
      } as GenerateReportResponse);
    }

    const result = await generateReportSinglePass(
      normalBefundText,
      transcriptText,
      clinicalData,
      modelMode
    );

    const { revisedBefundText, beurteilungText } = result;

    const finalReportHtml = buildFinalReportHtml(
      templateName,
      clinicalData,
      normalBefundText,
      revisedBefundText,
      beurteilungText
    );

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      start(controller) {
        try {
          controller.enqueue(encoder.encode(revisedBefundText));

          const finalData = JSON.stringify({
            ok: true,
            finalReportHtml,
            impressionText: beurteilungText,
            usedFallback: false,
          });

          controller.enqueue(encoder.encode('\n\n__END__\n' + finalData));
          controller.close();
        } catch (streamError: any) {
          const errorData = JSON.stringify({
            ok: false,
            finalReportHtml: '',
            error: { name: streamError.name || 'StreamError', message: streamError.message || 'Stream error' },
          });
          controller.enqueue(encoder.encode('\n\n__END__\n' + errorData));
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-BefundTool-Version': 'BefundTool v0.8.0',
      },
    });

  } catch (error: any) {
    console.error('LLM generation error:', error);

    try {
      const body: GenerateReportRequest = await req.json();
      const fallback = generateFallbackReport(
        body.templateName,
        body.normalBefundText,
        body.clinicalData,
        body.transcriptText
      );

      return NextResponse.json({
        ok: true,
        finalReportHtml: fallback.finalReportHtml,
        impressionText: fallback.impressionText,
        usedFallback: true,
        error: { name: error.name || 'GenerationError', message: error.message || 'LLM generation failed' },
      } as GenerateReportResponse);
    } catch {
      return NextResponse.json({
        ok: false,
        finalReportHtml: '',
        error: { name: error.name || 'UnknownError', message: error.message || 'Unknown error' },
      } as GenerateReportResponse, { status: 500 });
    }
  }
}
