import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AbstractsRequest {
  pmids: string[];
}

interface AbstractItem {
  pmid: string;
  abstract?: string;
}

interface AbstractsResponse {
  ok: boolean;
  error?: { message: string; name: string };
  items: AbstractItem[];
}

function extractAbstractFromXML(xml: string, pmid: string): string | undefined {
  const pmidMatch = new RegExp(`<PMID[^>]*>${pmid}</PMID>`, 'i');
  const pmidIndex = xml.search(pmidMatch);

  if (pmidIndex === -1) return undefined;

  const articleStart = xml.lastIndexOf('<PubmedArticle', pmidIndex);
  const articleEnd = xml.indexOf('</PubmedArticle>', pmidIndex);

  if (articleStart === -1 || articleEnd === -1) return undefined;

  const articleXML = xml.substring(articleStart, articleEnd + 16);

  const abstractMatch = articleXML.match(/<Abstract>([\s\S]*?)<\/Abstract>/i);
  if (!abstractMatch) return undefined;

  const abstractXML = abstractMatch[1];
  const textMatches = abstractXML.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi);

  if (!textMatches) return undefined;

  const parts = textMatches.map(match => {
    const labelMatch = match.match(/Label="([^"]+)"/i);
    const textMatch = match.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/i);

    if (!textMatch) return '';

    let text = textMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();

    if (labelMatch && labelMatch[1]) {
      return `${labelMatch[1]}: ${text}`;
    }
    return text;
  });

  return parts.filter(p => p).join('\n\n');
}

export async function POST(request: NextRequest): Promise<NextResponse<AbstractsResponse>> {
  try {
    let data: AbstractsRequest;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({
        ok: false,
        error: { message: 'Invalid JSON body', name: 'ValidationError' },
        items: []
      }, { status: 400 });
    }

    if (!data.pmids || !Array.isArray(data.pmids) || data.pmids.length === 0) {
      return NextResponse.json({
        ok: false,
        error: { message: 'PMIDs array is required', name: 'ValidationError' },
        items: []
      }, { status: 400 });
    }

    const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
    const params = new URLSearchParams({
      db: 'pubmed',
      id: data.pmids.join(','),
      retmode: 'xml'
    });

    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BefundTool/0.6 (Medical Evidence Research)'
      }
    });

    if (!response.ok) {
      throw new Error(`PubMed API returned status ${response.status}`);
    }

    const xml = await response.text();
    const items: AbstractItem[] = [];

    for (const pmid of data.pmids) {
      const abstract = extractAbstractFromXML(xml, pmid);
      items.push({
        pmid,
        abstract
      });
    }

    return NextResponse.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error('PubMed abstracts error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';

    return NextResponse.json({
      ok: false,
      error: { message: errMsg, name: errName },
      items: []
    }, { status: 500 });
  }
}
