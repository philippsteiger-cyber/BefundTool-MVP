import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SummaryRequest {
  pmids: string[];
}

interface ArticleItem {
  pmid: string;
  title: string;
  journal?: string;
  year?: string;
  authors?: string;
}

interface SummaryResponse {
  ok: boolean;
  error?: { message: string; name: string };
  items: ArticleItem[];
}

export async function POST(request: NextRequest): Promise<NextResponse<SummaryResponse>> {
  try {
    let data: SummaryRequest;
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

    const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
    const params = new URLSearchParams({
      db: 'pubmed',
      id: data.pmids.join(','),
      retmode: 'json'
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
    const items: ArticleItem[] = [];

    if (result?.result) {
      for (const pmid of data.pmids) {
        const article = result.result[pmid];
        if (article && article.title) {
          const authors = article.authors && article.authors.length > 0
            ? article.authors.slice(0, 3).map((a: any) => a.name).join(', ') + (article.authors.length > 3 ? ' et al.' : '')
            : undefined;

          items.push({
            pmid,
            title: article.title || 'Untitled',
            journal: article.source || article.fulljournalname,
            year: article.pubdate ? article.pubdate.split(' ')[0] : undefined,
            authors
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      items
    });
  } catch (error) {
    console.error('PubMed summary error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errName = error instanceof Error ? error.name : 'Error';

    return NextResponse.json({
      ok: false,
      error: { message: errMsg, name: errName },
      items: []
    }, { status: 500 });
  }
}
