import { NextRequest, NextResponse } from 'next/server';
import { safeGenerateJSON } from '@/lib/openaiSafe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface GenerateNotesRequest {
  studyName: string;
  befundTextPlain: string;
  beurteilungPlain: string;
  query: string;
  selectedArticles: Array<{
    pmid: string;
    title: string;
    journal?: string;
    year?: string;
    abstract?: string;
  }>;
}

interface NotesSchema {
  notes: string;
}

interface GenerateNotesResponse {
  ok: boolean;
  usedFallback: boolean;
  error?: { message: string; name: string };
  notes: string;
}

function validateNotesSchema(data: any): NotesSchema | null {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.notes !== 'string') return null;
  return data as NotesSchema;
}

function generateFallbackNotes(data: GenerateNotesRequest): string {
  const lines = ['Evidenz-Notizen (Literaturhinweise):'];
  lines.push('');

  for (const article of data.selectedArticles) {
    const citation = `${article.title} (${article.year || 'n.d.'}${article.journal ? ', ' + article.journal : ''})`;
    lines.push(`• ${citation} - PMID: ${article.pmid}`);
  }

  lines.push('');
  lines.push('Quelle: PubMed (E-utilities), Auswahl manuell.');

  return lines.join('\n');
}

async function generateWithOpenAI(
  data: GenerateNotesRequest
): Promise<NotesSchema> {

  const articlesContext = data.selectedArticles.map((article, idx) => {
    const parts = [
      `Artikel ${idx + 1}:`,
      `PMID: ${article.pmid}`,
      `Titel: ${article.title}`,
    ];

    if (article.journal) parts.push(`Journal: ${article.journal}`);
    if (article.year) parts.push(`Jahr: ${article.year}`);

    if (article.abstract) {
      parts.push(`Abstract: ${article.abstract.substring(0, 1500)}`);
    } else {
      parts.push('Abstract: nicht verfügbar (nur Metadaten)');
    }

    return parts.join('\n');
  }).join('\n\n---\n\n');

  const systemPrompt = `Du bist ein wissenschaftlicher Assistent, der Evidenz-Notizen für Radiologen erstellt.

KRITISCHE ANFORDERUNGEN:

1. AUSGABEFORMAT: Du MUSST ausschliesslich valides JSON ausgeben. KEIN Markdown, KEINE Code-Blöcke, KEIN zusätzlicher Text.

2. JSON-SCHEMA (exakt einhalten):
{
  "notes": "string"
}

3. INHALT DER NOTIZEN:
   - 3–7 prägnante Stichpunkte in deutscher Sprache (Schweizer Orthographie, kein "ß")
   - Jeder Stichpunkt MUSS mindestens einen PMID in-line referenzieren: "(PMID: 12345678)"
   - Verwende neutrale, nicht-patientenspezifische Sprache
   - Formulierungen wie "Literaturhinweis:", "Gemäss Literatur:", "In der Literatur wird beschrieben:"
   - Keine direkten medizinischen Ratschläge oder Empfehlungen
   - Keine Aussagen wie "Sie sollten X tun" oder "Der Patient benötigt Y"

4. ANTI-HALLUZINATION:
   - Verwende NUR Informationen aus den bereitgestellten Artikeln (Titel, Abstract, Metadaten)
   - Wenn Abstract fehlt, schreibe "auf Basis Titel/Metadaten" und bleibe vorsichtiger
   - Erfinde KEINE Befunde, Statistiken, Grenzwerte, die nicht in den Artikeln stehen
   - Wenn Informationen unklar sind, schreibe dies explizit

5. STRUKTUR:
   - Bullet points, jeder Punkt ist ein prägnanter Literaturhinweis
   - Letzter Punkt MUSS sein: "Quelle: PubMed (E-utilities), Auswahl manuell."

6. KONTEXT:
   - Die Notizen beziehen sich auf die PubMed-Suche mit Query: "${data.query}"
   - Untersuchung: ${data.studyName}
   - Die Notizen sollen allgemeine Literaturhinweise liefern, keine patientenspezifische Beratung`;

  const userPrompt = `Erstelle Evidenz-Notizen basierend auf folgenden PubMed-Artikeln:

${articlesContext}

WICHTIG:
- Jeder Stichpunkt muss PMID(s) enthalten
- Neutral und allgemein formulieren (nicht patientenspezifisch)
- Schweizer Orthographie
- Ausgabe NUR als JSON mit "notes" field

Erstelle nun die Evidenz-Notizen als JSON.`;

  const content = await safeGenerateJSON({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: 'json_object',
    maxTokens: 1500,
  });

  const parsed = JSON.parse(content);
  const validated = validateNotesSchema(parsed);

  if (!validated) {
    throw new Error('LLM returned invalid JSON schema');
  }

  return validated;
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateNotesResponse>> {
  try {
    let data: GenerateNotesRequest;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'Invalid JSON body', name: 'ValidationError' },
        notes: ''
      }, { status: 400 });
    }

    if (!data.selectedArticles || data.selectedArticles.length === 0) {
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'No articles selected', name: 'ValidationError' },
        notes: ''
      }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const fallbackNotes = generateFallbackNotes(data);
      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: 'OPENAI_API_KEY not configured', name: 'ConfigError' },
        notes: fallbackNotes
      });
    }

    try {
      const notesSchema = await generateWithOpenAI(data);

      return NextResponse.json({
        ok: true,
        usedFallback: false,
        notes: notesSchema.notes
      });
    } catch (error) {
      console.error('LLM generation failed:', error);
      const fallbackNotes = generateFallbackNotes(data);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json({
        ok: false,
        usedFallback: true,
        error: { message: `LLM generation failed: ${errMsg}`, name: 'LLMError' },
        notes: fallbackNotes
      });
    }
  } catch (error) {
    console.error('Generate notes route error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';

    return NextResponse.json({
      ok: false,
      usedFallback: true,
      error: { message: errMsg, name: errName },
      notes: ''
    }, { status: 500 });
  }
}
