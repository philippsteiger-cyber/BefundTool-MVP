import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SearchRequest {
  query: string;
  retmax?: number;
}

interface SearchResponse {
  ok: boolean;
  error?: { message: string; name: string };
  pmids: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse<SearchResponse>> {
  try {
    let data: SearchRequest;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({
        ok: false,
        error: { message: 'Invalid JSON body', name: 'ValidationError' },
        pmids: []
      }, { status: 400 });
    }

    if (!data.query || !data.query.trim()) {
      return NextResponse.json({
        ok: false,
        error: { message: 'Query is required', name: 'ValidationError' },
        pmids: []
      }, { status: 400 });
    }

    const retmax = data.retmax || 10;
    const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
    const params = new URLSearchParams({
      db: 'pubmed',
      term: data.query,
      retmax: String(retmax),
      retmode: 'json',
      sort: 'relevance'
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

    const result = await response.json();
    const pmids: string[] = result?.esearchresult?.idlist || [];

    return NextResponse.json({
      ok: true,
      pmids
    });
  } catch (error) {
    console.error('PubMed search error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';

    return NextResponse.json({
      ok: false,
      error: { message: errMsg, name: errName },
      pmids: []
    }, { status: 500 });
  }
}
