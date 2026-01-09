import { NextRequest, NextResponse } from 'next/server';
import { safeGenerateJSON } from '@/lib/openaiSafe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProcessReportRequest {
  studyId?: string;
  studyName: string;
  templateName?: string;
  template?: {
    name: string;
    normalBefundText: string;
  };
  normalBefundText?: string;
  clinicalData: Record<string, string>;
  transcriptText: string;
}

interface LLMReportSchema {
  sections: {
    untersuchung: string;
    klinische_angaben: string;
    technik: string;
    kontrastmittel: string;
    voruntersuchungen: string;
    befund: string;
    beurteilung: string;
  };
  meta: {
    warnings: string[];
  };
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFieldWithAllowedTags(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/&lt;br\/&gt;/gi, '<br/>');
  result = result.replace(/&lt;br&gt;/gi, '<br/>');
  result = result.replace(/&lt;mark class=&quot;hl&quot;&gt;/gi, '<mark class="hl">');
  result = result.replace(/&lt;\/mark&gt;/gi, '</mark>');
  return result;
}

function validateLLMSchema(data: any): LLMReportSchema | null {
  if (!data || typeof data !== 'object') return null;
  if (!data.sections || typeof data.sections !== 'object') return null;
  if (!data.meta || typeof data.meta !== 'object') return null;

  const requiredFields = [
    'untersuchung',
    'klinische_angaben',
    'technik',
    'kontrastmittel',
    'voruntersuchungen',
    'befund',
    'beurteilung'
  ];

  for (const field of requiredFields) {
    if (typeof data.sections[field] !== 'string') return null;
  }

  if (!Array.isArray(data.meta.warnings)) return null;

  return data as LLMReportSchema;
}

function renderReportFromJSON(schema: LLMReportSchema): string {
  const sections = schema.sections;

  const untersuchung = escapeHtml(sections.untersuchung);
  const klinischeAngaben = escapeHtml(sections.klinische_angaben);
  const technik = escapeHtml(sections.technik);
  const kontrastmittel = escapeHtml(sections.kontrastmittel);
  const voruntersuchungen = escapeHtml(sections.voruntersuchungen);

  const befund = sanitizeFieldWithAllowedTags(sections.befund);
  const beurteilung = sanitizeFieldWithAllowedTags(sections.beurteilung);

  return `
<div class="report-content">
  <p><strong>UNTERSUCHUNG:</strong><br/>${untersuchung}</p>
  <p><strong>KLINISCHE ANGABEN:</strong><br/>${klinischeAngaben}</p>
  <p><strong>TECHNIK:</strong><br/>${technik}</p>
  <p><strong>KONTRASTMITTEL:</strong><br/>${kontrastmittel}</p>
  <p><strong>VORUNTERSUCHUNGEN:</strong><br/>${voruntersuchungen}</p>
  <p><strong>BEFUND:</strong></p>
  <div class="befund-content">${befund}</div>
  <p><strong>BEURTEILUNG:</strong></p>
  <div class="impression-content">${beurteilung}</div>
</div>
  `.trim();
}

function improvedFallbackReport(data: ProcessReportRequest): string {
  const studyName = data.studyName || 'Unbekannte Untersuchung';
  const normalBefundText = data.normalBefundText || data.template?.normalBefundText || '';
  const transcriptText = data.transcriptText || '';
  const clinicalData = data.clinicalData || {};

  let befundContent = normalBefundText
    ? normalBefundText.replace(/\n/g, '<br/>')
    : 'Keine Normalbefund-Vorlage definiert.';

  if (transcriptText.trim()) {
    const sentences = transcriptText
      .split(/(?<=[.!?\n])\s*/)
      .filter(s => s.trim().length > 0);

    const organKeywords: Record<string, string[]> = {
      leber: ['leber', 'hepar', 'hepat'],
      gallenblase: ['gallenblase', 'gallenblasen', 'galle'],
      milz: ['milz'],
      nieren: ['niere', 'nieren', 'renal', 'ren'],
      pankreas: ['pankreas', 'pancrea'],
      nebennieren: ['nebenniere', 'nebennieren', 'adrenal'],
      lymphknoten: ['lymphknoten', 'lymph'],
      gefaesse: ['gefäss', 'gefäße', 'gefass', 'aorta', 'vena'],
      lunge: ['lunge', 'lungen', 'pulmo', 'pleura'],
      herz: ['herz', 'cardiac', 'perikard'],
    };

    const insertedByKeyword: Record<string, string[]> = {};
    const unmatchedSentences: string[] = [];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      let matched = false;

      for (const [category, keywords] of Object.entries(organKeywords)) {
        if (keywords.some(kw => lowerSentence.includes(kw))) {
          if (!insertedByKeyword[category]) {
            insertedByKeyword[category] = [];
          }
          insertedByKeyword[category].push(sentence);
          matched = true;
          break;
        }
      }

      if (!matched) {
        unmatchedSentences.push(sentence);
      }
    }

    const insertions: string[] = [];
    for (const category in insertedByKeyword) {
      const categoryInserts = insertedByKeyword[category]
        .map(s => `<mark class="hl">${escapeHtml(s.trim())}</mark>`)
        .join(' ');
      insertions.push(categoryInserts);
    }

    if (unmatchedSentences.length > 0) {
      const unmatchedInserts = unmatchedSentences
        .map(s => `<mark class="hl">${escapeHtml(s.trim())}</mark>`)
        .join(' ');
      insertions.push(unmatchedInserts);
    }

    if (insertions.length > 0) {
      if (befundContent !== 'Keine Normalbefund-Vorlage definiert.') {
        befundContent += '<br/><br/>' + insertions.join('<br/><br/>');
      } else {
        befundContent = insertions.join('<br/><br/>');
      }
    }
  }

  const beurteilungContent = transcriptText.trim()
    ? '<mark class="hl">Siehe Befund. Weitere klinische Korrelation empfohlen.</mark>'
    : '-';

  return `
<div class="report-content">
  <p><strong>UNTERSUCHUNG:</strong><br/>${escapeHtml(studyName)}</p>
  <p><strong>KLINISCHE ANGABEN:</strong><br/>${escapeHtml(clinicalData.indication || clinicalData.klinischeAngaben || '-')}</p>
  <p><strong>TECHNIK:</strong><br/>${escapeHtml(clinicalData.technik || '-')}</p>
  <p><strong>KONTRASTMITTEL:</strong><br/>${escapeHtml(clinicalData.kontrastmittel || '-')}</p>
  <p><strong>VORUNTERSUCHUNGEN:</strong><br/>${escapeHtml(clinicalData.voruntersuchungen || '-')}</p>
  <p><strong>BEFUND:</strong></p>
  <div class="befund-content">${befundContent}</div>
  <p><strong>BEURTEILUNG:</strong></p>
  <div class="impression-content">${beurteilungContent}</div>
</div>
  `.trim();
}

async function generateWithOpenAI(
  data: ProcessReportRequest
): Promise<LLMReportSchema> {
  const studyName = data.studyName || 'Unbekannte Untersuchung';
  const templateName = data.templateName || data.template?.name || 'Standard';
  const normalBefundText = data.normalBefundText || data.template?.normalBefundText || '';
  const transcriptText = data.transcriptText || '';
  const clinicalData = data.clinicalData || {};

  const systemPrompt = `Du bist ein erfahrener Radiologe, der strukturierte radiologische Befunde erstellt.

KRITISCHE ANFORDERUNGEN:

1. AUSGABEFORMAT: Du MUSST ausschliesslich valides JSON ausgeben. KEIN Markdown, KEINE Code-Blöcke, KEIN zusätzlicher Text.

2. JSON-SCHEMA (exakt einhalten):
{
  "sections": {
    "untersuchung": "string",
    "klinische_angaben": "string",
    "technik": "string",
    "kontrastmittel": "string",
    "voruntersuchungen": "string",
    "befund": "string",
    "beurteilung": "string"
  },
  "meta": {
    "warnings": ["string"]
  }
}

3. ERLAUBTE HTML-TAGS (nur in befund/beurteilung):
   - <br/> für Zeilenumbrüche
   - <mark class="hl">...</mark> für Transkript-gestützte Pathologie
   KEINE anderen HTML-Tags. Alle anderen Felder sind plain text.

4. BEFUND-SEKTION (KRITISCH - IN-PLACE EDITING):
   - Beginne mit dem bereitgestellten Normalbefund-Text als Basis
   - Modifiziere den Normalbefund IN-PLACE basierend auf dem Transkript
   - NIEMALS einen separaten Abschnitt "Aus dem Transkript" erstellen
   - Wenn das Transkript pathologische Befunde zu einem Organ enthält, ERSETZE oder ERGÄNZE den entsprechenden Satz im Normalbefund
   - Integriere Transkript-Befunde natürlich in den Textfluss
   - Beispiel:
     * Normal: "Leber normgross, homogene Parenchymstruktur."
     * Transkript: "Zyste in der Leber"
     * Output befund: "Leber normgross. <mark class="hl">Zyste im rechten Leberlappen, ca. 2 cm.</mark> Übrige Parenchymstruktur homogen."

5. ANTI-HALLUZINATION (STRENG):
   - ALLE Aussagen, die aus dem Transkript stammen, MÜSSEN mit <mark class="hl">...</mark> umschlossen werden
   - Erfinde KEINE Befunde, Messungen, Organe, Vergleiche, Laborwerte oder Follow-up-Empfehlungen
   - Verwende NUR Informationen, die EXPLIZIT in transcriptText oder clinicalData vorhanden sind
   - Wenn das Transkript vage ist (z.B. "unklar"), schreibe: "<mark class="hl">im Transkript als unklar beschrieben</mark>"
   - Wenn eine Information fehlt: schreibe neutral "keine Angabe" oder behalte den Normalbefund

6. HIGHLIGHTING-REGELN:
   - Pathologische/abnormale Aussagen aus Transkript: <mark class="hl">...</mark>
   - Normale Baseline-Aussagen, die normal bleiben: NICHT highlighten

7. BEURTEILUNG:
   - Knappe Zusammenfassung basierend NUR auf BEFUND und klinischen Angaben
   - KEINE erfundenen Empfehlungen für weitere Bildgebung oder Laborwerte
   - Wenn nicht genug Information vorhanden: schreibe dies explizit

8. STIL:
   - Schweizer Orthographie (kein "ß", verwende "ss")
   - Deutscher medizinischer Radiologie-Stil
   - Präzise, sachlich, keine Übertreibungen

9. WARNINGS:
   - Wenn das Transkript unklar oder unvollständig ist, füge Warnung zu meta.warnings hinzu
   - Beispiel: ["Transkript unvollständig", "Keine Angabe zu Kontrastmittel"]`;

  const userPrompt = `Erstelle einen radiologischen Befund basierend auf folgenden Daten:

UNTERSUCHUNG: ${studyName}

TEMPLATE: ${templateName}

NORMALBEFUND (als Ausgangspunkt für BEFUND-Sektion):
${normalBefundText || 'Kein Normalbefund definiert.'}

KLINISCHE ANGABEN:
- Indikation: ${clinicalData.indication || clinicalData.klinischeAngaben || 'Keine Angabe'}
- Technik: ${clinicalData.technik || 'Keine Angabe'}
- Kontrastmittel: ${clinicalData.kontrastmittel || 'Keine Angabe'}
- Voruntersuchungen: ${clinicalData.voruntersuchungen || 'Keine Angabe'}

TRANSKRIPT (diktierte Befunde):
${transcriptText || 'Kein Transkript vorhanden'}

WICHTIG:
- Integriere die Transkript-Befunde IN den Normalbefund (nicht als separater Abschnitt)
- Markiere alle Transkript-Aussagen mit <mark class="hl">...</mark>
- Ausgabe NUR als JSON (keine zusätzlichen Texte)

Erstelle nun den vollständigen Befund als JSON.`;

  const content = await safeGenerateJSON({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: 'json_object',
    maxTokens: 2500,
  });

  const parsed = JSON.parse(content);
  const validated = validateLLMSchema(parsed);

  if (!validated) {
    throw new Error('LLM returned invalid JSON schema');
  }

  return validated;
}

export async function POST(request: NextRequest) {
  try {
    let data: ProcessReportRequest;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'Invalid JSON body', name: 'ValidationError' },
        finalReportHtml: ''
      }, { status: 400 });
    }

    if (!data.studyName) {
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'Missing required field: studyName', name: 'ValidationError' },
        finalReportHtml: ''
      }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const fallbackHtml = improvedFallbackReport(data);
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'OPENAI_API_KEY not configured', name: 'ConfigError' },
        finalReportHtml: fallbackHtml
      });
    }

    try {
      const llmSchema = await generateWithOpenAI(data);
      const finalReportHtml = renderReportFromJSON(llmSchema);

      return NextResponse.json({
        ok: true,
        usedFallback: false,
        finalReportHtml
      });
    } catch (error) {
      console.error('LLM generation failed:', error);
      const fallbackHtml = improvedFallbackReport(data);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: `LLM generation failed: ${errMsg}`, name: 'LLMError' },
        finalReportHtml: fallbackHtml
      });
    }
  } catch (error) {
    console.error('Process report route error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';

    const fallbackHtml = improvedFallbackReport({
      studyName: '',
      clinicalData: {},
      transcriptText: ''
    });

    return NextResponse.json({
      ok: false,
      usedFallback: true,
      error: { message: errMsg, name: errName },
      finalReportHtml: fallbackHtml
    }, { status: 500 });
  }
}
