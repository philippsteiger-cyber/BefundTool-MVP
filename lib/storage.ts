import { Report, Template, Macro, CorrectionEntry } from './types';
import { seedTemplates } from './seedTemplates';

const STORAGE_KEYS = {
  REPORTS: 'befund-reports-v4',
  ACTIVE_REPORT: 'befund-active-report-v4',
  TEMPLATES: 'befund-templates-v7',
  MACROS: 'befund-macros-v4',
  CORRECTIONS: 'befund-corrections-v5',
  AUTO_SUGGEST: 'befund-auto-suggest-v4',
  TEMPLATE_LOCKED: 'befund-template-locked-v4',
  DICTIONARY_ACCORDION: 'befund-dictionary-accordion-v1',
};

export const DEFAULT_MACROS: Macro[] = [
  { id: 'macro-1', title: 'Unauffällig', text: 'Unauffälliger Befund, keine pathologischen Veränderungen.' },
  { id: 'macro-2', title: 'Kontrastmittel i.v.', text: 'Nach intravenöser Kontrastmittelgabe.' },
  { id: 'macro-3', title: 'Vergleich VU', text: 'Im Vergleich zur Voruntersuchung vom [DATUM].' },
  { id: 'macro-4', title: 'Keine VU', text: 'Keine Voruntersuchungen zum Vergleich verfügbar.' },
];

export const DEFAULT_CORRECTIONS: CorrectionEntry[] = [
  { id: 'c1', wrong: 'pirats', correct: 'PI-RADS', caseInsensitive: true, wholeWord: true },
  { id: 'c2', wrong: 'pirads', correct: 'PI-RADS', caseInsensitive: true, wholeWord: true },
  { id: 'c3', wrong: 'adik', correct: 'ADC', caseInsensitive: true, wholeWord: true },
  { id: 'c4', wrong: 'vkb', correct: 'VKB', caseInsensitive: true, wholeWord: true },
  { id: 'c5', wrong: 'hkb', correct: 'HKB', caseInsensitive: true, wholeWord: true },
  { id: 'c6', wrong: 't2w', correct: 'T2w', caseInsensitive: true, wholeWord: true },
  { id: 'c7', wrong: 'dwi', correct: 'DWI', caseInsensitive: true, wholeWord: true },
  { id: 'c8', wrong: 'flair', correct: 'FLAIR', caseInsensitive: true, wholeWord: true },
  { id: 'c9', wrong: 'stir', correct: 'STIR', caseInsensitive: true, wholeWord: true },
  { id: 'c10', wrong: 'hounsfield', correct: 'Hounsfield', caseInsensitive: true, wholeWord: true },
  { id: 'c11', wrong: 'komma', correct: ',', caseInsensitive: true, wholeWord: true },
  { id: 'c12', wrong: 'punkt', correct: '.', caseInsensitive: true, wholeWord: true },
  { id: 'c13', wrong: 'doppelpunkt', correct: ':', caseInsensitive: true, wholeWord: true },
  { id: 'c14', wrong: 'neue zeile', correct: '\n', caseInsensitive: true, wholeWord: false },
  { id: 'c15', wrong: 'neuer absatz', correct: '\n\n', caseInsensitive: true, wholeWord: false },
];

export function createCorrectionEntry(wrong: string, correct: string): CorrectionEntry {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    wrong,
    correct,
    caseInsensitive: true,
    wholeWord: true,
  };
}

function safeGetItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function safeSetItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage error:', e);
  }
}

export function loadReports(): Report[] {
  return safeGetItem(STORAGE_KEYS.REPORTS, []);
}

export function saveReports(reports: Report[]): void {
  safeSetItem(STORAGE_KEYS.REPORTS, reports);
}

export function loadActiveReportId(): string | null {
  return safeGetItem(STORAGE_KEYS.ACTIVE_REPORT, null);
}

export function saveActiveReportId(id: string | null): void {
  safeSetItem(STORAGE_KEYS.ACTIVE_REPORT, id);
}

export function loadTemplates(): Template[] {
  const stored = safeGetItem<Template[]>(STORAGE_KEYS.TEMPLATES, []);
  if (stored.length === 0) {
    saveTemplates(seedTemplates);
    return seedTemplates;
  }
  return stored;
}

export function saveTemplates(templates: Template[]): void {
  safeSetItem(STORAGE_KEYS.TEMPLATES, templates);
}

export function seedAllTemplates(): void {
  saveTemplates(seedTemplates);
}

export function appendMissingSeedTemplates(): number {
  const existing = loadTemplates();
  const existingIds = new Set(existing.map(t => t.id));
  const missing = seedTemplates.filter(t => !existingIds.has(t.id));

  if (missing.length > 0) {
    saveTemplates([...existing, ...missing]);
  }

  return missing.length;
}

export function loadMacros(): Macro[] {
  return safeGetItem(STORAGE_KEYS.MACROS, DEFAULT_MACROS);
}

export function saveMacros(macros: Macro[]): void {
  safeSetItem(STORAGE_KEYS.MACROS, macros);
}

export function loadCorrections(): CorrectionEntry[] {
  return safeGetItem(STORAGE_KEYS.CORRECTIONS, DEFAULT_CORRECTIONS);
}

export function saveCorrections(corrections: CorrectionEntry[]): void {
  safeSetItem(STORAGE_KEYS.CORRECTIONS, corrections);
}

export function loadAutoSuggest(): boolean {
  return safeGetItem(STORAGE_KEYS.AUTO_SUGGEST, true);
}

export function saveAutoSuggest(value: boolean): void {
  safeSetItem(STORAGE_KEYS.AUTO_SUGGEST, value);
}

export function loadTemplateLocked(): boolean {
  return safeGetItem(STORAGE_KEYS.TEMPLATE_LOCKED, false);
}

export function saveTemplateLocked(value: boolean): void {
  safeSetItem(STORAGE_KEYS.TEMPLATE_LOCKED, value);
}

export function loadDictionaryAccordionOpen(): string[] {
  return safeGetItem(STORAGE_KEYS.DICTIONARY_ACCORDION, []);
}

export function saveDictionaryAccordionOpen(value: string[]): void {
  safeSetItem(STORAGE_KEYS.DICTIONARY_ACCORDION, value);
}

export function createNewReport(): Report {
  return {
    id: `report-${Date.now()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'draft',
    templateId: null,
    manualTemplateOverride: false,
    transcriptText: '',
    finalReportHtml: '',
    isStale: false,
    clinicalData: {},
    label: '',
    evidence: {
      query: '',
      results: [],
      notes: '',
      lastUpdatedAt: null
    }
  };
}

export function createNewTemplate(): Template {
  return {
    id: `tpl-${Date.now()}`,
    name: 'Neue Vorlage',
    keywords: [],
    normalBefundText: 'Normalbefund hier eingeben...',
    updatedAt: Date.now(),
  };
}
