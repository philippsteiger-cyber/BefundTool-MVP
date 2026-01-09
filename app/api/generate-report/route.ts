import { NextRequest, NextResponse } from 'next/server';
import { highlightDifferences } from '@/lib/diffHighlight';
import { getSystemPrompt } from '@/lib/firebase';

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
  didYouKnow?: {
    fact: string;
    pubmedSearchTerm: string;
  };
  icd10?: string;
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

const DEFAULT_SYSTEM_PROMPT = `You are a radiology assistant. Generate a complete medical report with both BEFUND and BEURTEILUNG sections.

ABKÜRZUNGSVERBOT (ABSOLUTE REGEL):
1. NIEMALS "V.a." - immer "Verdacht auf" ausschreiben
2. NIEMALS "Z.n." - immer "Zustand nach" ausschreiben
3. NIEMALS "St.n." - immer "Status nach" ausschreiben
4. NIEMALS "St.p." - immer "Status post" oder "Zustand nach" ausschreiben
5. Vermeide generische Abkürzungen, wo Fachsprache präziser ist
6. Diese Regel gilt für BEFUND und BEURTEILUNG

STIL-REGELN:
1. Harter Nominalstil in der Beurteilung (keine Verben wie "zeigt sich", "findet sich")
2. VERBOTENE PHRASE: "im Bereich" - nutze stattdessen präzise anatomische Begriffe
3. Beispiel FALSCH: "Im Bereich der Leber zeigt sich..."
4. Beispiel RICHTIG: "Lebersegment VI: Hypodense Läsion..."

FORMATIERUNG (ZWINGEND - HÖCHSTE PRIORITÄT):
1. Keine Leerzeile nach Voruntersuchung: Wenn "Keine Voruntersuchung" oder "Vergleich mit..." steht, muss der eigentliche Befundtext direkt in der nächsten Zeile beginnen (kein \\n\\n, nur \\n)
2. Absatz-Erhalt: Das Template darf NICHT zusammengezogen werden. Jeder Organ-Abschnitt aus dem Template MUSS durch eine Leerzeile (\\n\\n) getrennt bleiben
3. Die Absatz-Struktur des Templates MUSS zwingend 1:1 erhalten bleiben
4. Es ist STRENG VERBOTEN, Absätze zu einer Zeile zusammenzufassen
5. Organ-Abschnitte (Leber, Pankreas etc.) MÜSSEN durch Leerzeilen getrennt bleiben
6. Struktur: Nutze Semikolons statt Aufzählungszeichen im Fließtext
7. Preserve ALL line breaks and paragraph structure from the template exactly as given
8. Each organ section must maintain its own paragraph with empty lines between sections

CRITICAL MERGING RULES:
1. Template-first merge: Start with the baseline BEFUND text as source of truth
2. If transcript indicates pathology, REWRITE the relevant baseline sentence(s) - do NOT append
3. Merge transcript findings naturally into the baseline text
4. Do NOT create "Aus dem Transkript" sections
5. Use Swiss German medical terminology
6. Keep text concise and professional

BEURTEILUNG RULES (DER "FILTER" - MEDIZINISCHE LOGIK):
1. SORTIERUNG: Beginne IMMER mit der schlimmsten/akutesten Pathologie (Priorität: Akut/Lebensbedrohlich > Chronisch/Relevant > Inzidentell)
2. Beantworte die Fragestellung: Falls eine Fragestellung diktiert wurde, gehe im ersten Satz darauf ein
3. EXKLUSION (Was NICHT rein darf):
   - Keine rein degenerativen Veränderungen (z.B. leichte Arthrose, Spondylose), außer sie sind die Hauptbeschwerde
   - Keine Sätze wie "Sonst unauffällig" oder "Keine weitere Pathologie"
   - Keine Wiederholung von Normalbefunden
4. Separate Indikation (Fakten) from Fragestellung (Auftrag/Question to answer)
5. ALWAYS provide a Beurteilung (never omit)
6. Use 1–5 bullet points (start each with •)
7. Base assessment ONLY on the Befund + clinical data
8. No speculative recommendations unless explicitly supported
9. Conservative radiology wording
10. VERBOTENE FLOSKEL: Der Satz "Beurteilung gemäss Befund" ist STRENG VERBOTEN
11. If insufficient information, provide a meaningful conservative assessment, never use the forbidden phrase

GENDER LOGIC:
- Try to recognize patient gender from context
- If female: Remove mentions of "Prostata"
- If male: Remove mentions of "Uterus", "Ovarien", "Adnexe"
- If gender unclear: Keep default text but mark both organs

DID YOU KNOW RULES (WISSENWERTES):
1. Generate ONE interesting medical fact related to the findings in this report
2. Fact MUST be for specialists with >10 years experience (NOT basic knowledge)
3. Should be advanced, nuanced information that experienced radiologists would find valuable
4. Keep fact concise (1-2 sentences, in German)
5. Provide an English PubMed search term related to the fact
6. Search term should be specific and useful for finding research articles

ICD-10 CODING RULES:
1. Extract the main diagnosis from the Beurteilung
2. Assign the appropriate ICD-10-GM code
3. Use only the code (e.g., "K85.9"), no additional text
4. If no specific diagnosis: use "Z03.9" (Beobachtung bei Verdacht auf Krankheit)
5. Conservative coding approach for radiological findings

Return STRICT JSON with this exact structure:
{
  "revisedBefundText": "your merged befund text here",
  "beurteilungText": "• bullet 1\\n• bullet 2",
  "didYouKnow": {
    "fact": "interesting medical fact in German",
    "pubmedSearchTerm": "english search term for pubmed"
  },
  "icd10": "K85.9"
}`;

async function generateReportSinglePass(
  normalBefundText: string,
  transcriptText: string,
  clinicalData: Record<string, string>,
  modelMode: 'standard' | 'expert' = 'standard'
): Promise<{ revisedBefundText: string; beurteilungText: string; didYouKnow: { fact: string; pubmedSearchTerm: string }; icd10: string }> {
  const indication = clinicalData.indication || '';
  const fragestellung = clinicalData.fragestellung || '';

  let systemPrompt = DEFAULT_SYSTEM_PROMPT;

  try {
    const firebasePrompt = await getSystemPrompt();
    if (firebasePrompt && firebasePrompt.trim()) {
      systemPrompt = firebasePrompt;
    }
  } catch (error) {
    console.warn('Failed to load system prompt from Firebase, using default:', error);
  }

  const userPrompt = `Baseline BEFUND:
${normalBefundText || '(keine Vorlage)'}

Indikation (Fakten): ${indication || '-'}
Fragestellung (zu beantworten): ${fragestellung || '-'}

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
    didYouKnow: parsed.didYouKnow || {
      fact: 'Radiologische Bildgebung ist ein wesentlicher Bestandteil der modernen Diagnostik.',
      pubmedSearchTerm: 'radiology diagnostic imaging'
    },
    icd10: parsed.icd10 || 'Z03.9',
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

    const { revisedBefundText, beurteilungText, didYouKnow, icd10 } = result;

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
            didYouKnow,
            icd10,
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
        'X-BefundTool-Version': 'BefundTool v0.9.6',
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
