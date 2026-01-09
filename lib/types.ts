export interface Template {
  id: string;
  name: string;
  keywords: string[];
  normalBefundText: string;
  updatedAt: number;
}

export interface TemplateScore {
  template: Template;
  score: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CorrectionEntry {
  id: string;
  wrong: string;
  correct: string;
  caseInsensitive: boolean;
  wholeWord: boolean;
}

export interface Macro {
  id: string;
  title: string;
  text: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  journal?: string;
  year?: string;
  authors?: string;
  abstract?: string;
  selected: boolean;
}

export interface Evidence {
  query: string;
  results: PubMedArticle[];
  notes: string;
  lastUpdatedAt: number | null;
}

export interface Report {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'final';
  templateId: string | null;
  manualTemplateOverride: boolean;
  transcriptText: string;
  finalReportHtml: string;
  isStale: boolean;
  clinicalData: Record<string, string>;
  label: string;
  evidence?: Evidence;
  didYouKnow?: {
    fact: string;
    pubmedSearchTerm: string;
  };
  icd10?: string;
}
