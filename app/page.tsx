'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useRecording } from '@/hooks/useRecording';
import { safeFetchJson } from '@/lib/safeFetch';
import {
  loadReports,
  saveReports,
  loadActiveReportId,
  saveActiveReportId,
  loadTemplates,
  saveTemplates,
  loadMacros,
  saveMacros,
  loadCorrections,
  saveCorrections,
  loadAutoSuggest,
  saveAutoSuggest,
  loadTemplateLocked,
  saveTemplateLocked,
  loadDictionaryAccordionOpen,
  saveDictionaryAccordionOpen,
  createNewReport,
  createNewTemplate,
  createCorrectionEntry,
  seedAllTemplates,
  appendMissingSeedTemplates,
} from '@/lib/storage';
import { processReport, rankTemplates, stripHtmlForCopy } from '@/lib/reportProcessor';
import { applyCorrections } from '@/lib/textProcessing';
import { buildPubMedQueryFromReport, stripHtmlTags } from '@/lib/queryBuilder';
import { Report, Template, Macro, CorrectionEntry, PubMedArticle } from '@/lib/types';
import ContentEditableEditor, { EditorHandle } from '@/components/ContentEditableEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CircleAlert as AlertCircle, Mic, MicOff, Plus, Trash2, Copy, FileText, RefreshCw, Loader as Loader2, Lock, Clock as Unlock, Bold, Italic, Underline, Eraser, Search, Book, ChevronDown, ChevronRight, Camera, Zap, Brain, Server, Settings } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { getSystemPrompt, saveSystemPrompt, isFirebaseConfigured, initializeFirebase, loadTemplatesFromFirebase, saveTemplateToFirebase, deleteTemplateFromFirebase } from '@/lib/firebase';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Heute';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Gestern';
  } else {
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}

function groupReportsByDate(reports: Report[]): Record<string, Report[]> {
  const groups: Record<string, Report[]> = {};
  const sorted = [...reports].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const report of sorted) {
    const dateKey = formatDate(report.updatedAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(report);
  }

  return groups;
}

const APP_VERSION = "0.9.7";

export default function RadAssistPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ configured: boolean; checked: boolean }>({ configured: false, checked: false });
  const [selectedModel, setSelectedModel] = useState<'standard' | 'expert' | 'openllm'>('standard');

  const [autoSuggest, setAutoSuggest] = useState(true);
  const [templateLocked, setTemplateLocked] = useState(false);
  const [dictionaryAccordionOpen, setDictionaryAccordionOpen] = useState<string[]>([]);

  const [newMacroTitle, setNewMacroTitle] = useState('');
  const [newMacroText, setNewMacroText] = useState('');

  const [selectedEditorTemplateId, setSelectedEditorTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const [dictSearch, setDictSearch] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [lastInsertedText, setLastInsertedText] = useState('');
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const [asrError, setAsrError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [useServerASR, setUseServerASR] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  const [evidenceQuery, setEvidenceQuery] = useState('');
  const [evidenceSearching, setEvidenceSearching] = useState(false);
  const [evidenceGenerating, setEvidenceGenerating] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [systemPromptText, setSystemPromptText] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  const transcriptEditorRef = useRef<EditorHandle>(null);
  const finalReportEditorRef = useRef<EditorHandle>(null);

  const activeReport = useMemo(() => {
    return reports.find(r => r.id === activeReportId) || null;
  }, [reports, activeReportId]);

  const rankedTemplates = useMemo(() => {
    if (!activeReport?.transcriptText?.trim()) return [];
    return rankTemplates(templates, activeReport.transcriptText);
  }, [templates, activeReport?.transcriptText]);

  const suggestedTemplateId = useMemo(() => {
    if (rankedTemplates.length > 0 && rankedTemplates[0].score > 0) {
      return rankedTemplates[0].template.id;
    }
    return null;
  }, [rankedTemplates]);

  const effectiveTemplateId = useMemo(() => {
    if (activeReport?.manualTemplateOverride) {
      return activeReport?.templateId || null;
    }
    return suggestedTemplateId || activeReport?.templateId || null;
  }, [templateLocked, autoSuggest, activeReport?.templateId, suggestedTemplateId]);

  const selectedTemplate = useMemo(() => {
    if (!effectiveTemplateId) return null;
    return templates.find(t => t.id === effectiveTemplateId) || null;
  }, [effectiveTemplateId, templates]);

  const editorTemplate = useMemo(() => {
    if (!selectedEditorTemplateId) return null;
    return templates.find(t => t.id === selectedEditorTemplateId) || null;
  }, [templates, selectedEditorTemplateId]);

  const canProcess = useMemo(() => {
    return activeReport &&
      effectiveTemplateId &&
      activeReport.transcriptText.trim().length > 0;
  }, [activeReport, effectiveTemplateId]);

  const processedFinalReportHtml = useMemo(() => {
    if (!activeReport?.finalReportHtml) return '';

    let html = activeReport.finalReportHtml;
    const lowerHtml = html.toLowerCase();

    const hasProstata = lowerHtml.includes('prostata');
    const hasUterus = lowerHtml.includes('uterus');

    if (hasProstata && hasUterus) {
      html = html.replace(/\b(Prostata|prostata)\b/g, '<span class="gender-warning">$1</span>');
      html = html.replace(/\b(Uterus|uterus)\b/g, '<span class="gender-warning">$1</span>');
    }

    return html;
  }, [activeReport?.finalReportHtml]);

  const filteredCorrections = useMemo(() => {
    if (!dictSearch.trim()) return corrections;
    const lower = dictSearch.toLowerCase();
    return corrections.filter(c =>
      c.wrong.toLowerCase().includes(lower) ||
      c.correct.toLowerCase().includes(lower)
    );
  }, [corrections, dictSearch]);

  const handleFinalSegment = useCallback((processedText: string) => {
    if (transcriptEditorRef.current) {
      transcriptEditorRef.current.insertTextAtCursor(processedText + ' ');
      setLastInsertedText(processedText);
      setAsrError(null);
    }
  }, []);

  const handleASRError = useCallback((error: { message: string; name: string }) => {
    setAsrError(`ASR Fehler: ${error.message}`);
  }, []);

  const { isListening, interimTranscript, isSupported, startListening, stopListening } =
    useSpeechRecognition({
      onFinalSegment: handleFinalSegment,
      corrections,
    });

  const {
    isRecording: isServerRecording,
    isUploading: isServerUploading,
    isSupported: isServerSupported,
    error: serverASRError,
    startRecording: startServerRecording,
    stopRecording: stopServerRecording,
    clearError: clearServerASRError,
  } = useRecording({
    onTranscriptReady: handleFinalSegment,
    onError: handleASRError,
    hints: corrections.map(c => c.wrong),
    replacements: corrections.map(c => ({
      from: c.wrong,
      to: c.correct,
      caseInsensitive: c.caseInsensitive,
      wholeWord: c.wholeWord,
    })),
    language: 'de-CH',
  });

  useEffect(() => {
    const initializeData = async () => {
      let loadedReports = loadReports();
      let loadedTemplates = loadTemplates();
      const loadedMacros = loadMacros();
      const loadedCorrections = loadCorrections();
      const loadedAutoSuggest = loadAutoSuggest();
      const loadedTemplateLocked = loadTemplateLocked();
      const loadedDictionaryAccordion = loadDictionaryAccordionOpen();

      try {
        const firebaseTemplates = await loadTemplatesFromFirebase();
        if (firebaseTemplates.length > 0) {
          loadedTemplates = firebaseTemplates;
          saveTemplates(firebaseTemplates);
        }
      } catch (error) {
        console.warn('Failed to load templates from Firebase, using local storage:', error);
      }

      if (loadedReports.length === 0) {
        const newReport = createNewReport();
        loadedReports = [newReport];
        saveReports(loadedReports);
        setActiveReportId(newReport.id);
        saveActiveReportId(newReport.id);
      } else {
        const savedActiveId = loadActiveReportId();
        if (savedActiveId && loadedReports.find(r => r.id === savedActiveId)) {
          setActiveReportId(savedActiveId);
        } else {
          const mostRecent = [...loadedReports].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          setActiveReportId(mostRecent.id);
        }
      }

      setReports(loadedReports);
      setTemplates(loadedTemplates);
      setMacros(loadedMacros);
      setCorrections(loadedCorrections);
      setAutoSuggest(loadedAutoSuggest);
      setTemplateLocked(loadedTemplateLocked);
      setDictionaryAccordionOpen(loadedDictionaryAccordion);

      if (loadedTemplates.length > 0) {
        setSelectedEditorTemplateId(loadedTemplates[0].id);
      }

      fetch('/api/llm-status')
        .then(res => res.json())
        .then(data => setLlmStatus({ configured: data.configured || false, checked: true }))
        .catch(() => setLlmStatus({ configured: false, checked: true }));
    };

    initializeData();
  }, []);

  useEffect(() => {
    if (activeReportId) {
      saveActiveReportId(activeReportId);
    }
  }, [activeReportId]);

  useEffect(() => {
    saveAutoSuggest(autoSuggest);
  }, [autoSuggest]);

  useEffect(() => {
    saveTemplateLocked(templateLocked);
  }, [templateLocked]);

  useEffect(() => {
    saveDictionaryAccordionOpen(dictionaryAccordionOpen);
  }, [dictionaryAccordionOpen]);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        setSelectedText(selection.toString().trim());
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, []);

  const updateActiveReport = useCallback((updates: Partial<Report>) => {
    if (!activeReportId) return;

    setReports(prev => {
      const updated = prev.map(r => {
        if (r.id === activeReportId) {
          return { ...r, ...updates, updatedAt: Date.now() };
        }
        return r;
      });
      saveReports(updated);
      return updated;
    });
  }, [activeReportId]);

  const ensureActiveReport = useCallback((): Report | null => {
    if (activeReportId && reports.find(r => r.id === activeReportId)) {
      return reports.find(r => r.id === activeReportId) || null;
    }

    if (reports.length > 0) {
      const mostRecent = [...reports].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveReportId(mostRecent.id);
      saveActiveReportId(mostRecent.id);
      return mostRecent;
    }

    const newReport = createNewReport();
    const updated = [newReport, ...reports];
    setReports(updated);
    saveReports(updated);
    setActiveReportId(newReport.id);
    saveActiveReportId(newReport.id);
    return newReport;
  }, [activeReportId, reports]);

  const handleNewReport = useCallback(() => {
    const newReport = createNewReport();
    setReports(prev => {
      const updated = [newReport, ...prev];
      saveReports(updated);
      return updated;
    });
    setActiveReportId(newReport.id);
    setTemplateLocked(false);
  }, []);

  const handleSelectReport = useCallback((reportId: string) => {
    setActiveReportId(reportId);
  }, []);

  const handleDeleteReport = useCallback((reportId: string) => {
    setReports(prev => {
      const updated = prev.filter(r => r.id !== reportId);
      saveReports(updated);

      if (activeReportId === reportId) {
        setActiveReportId(updated.length > 0 ? updated[0].id : null);
      }

      return updated;
    });
    toast.success('Bericht gelöscht');
  }, [activeReportId]);

  const handleManualTemplateChange = useCallback((templateId: string) => {
    updateActiveReport({ templateId, manualTemplateOverride: true, isStale: true });
  }, [updateActiveReport]);

  const handleEnableAutoTemplate = useCallback(() => {
    updateActiveReport({ manualTemplateOverride: false });
  }, [updateActiveReport]);

  const handleTranscriptChange = useCallback((text: string) => {
    ensureActiveReport();
    updateActiveReport({ transcriptText: text, isStale: true });
  }, [updateActiveReport, ensureActiveReport]);

  const handleFinalReportChange = useCallback((html: string) => {
    updateActiveReport({ finalReportHtml: html });
  }, [updateActiveReport]);

  const handleClearTranscript = useCallback(() => {
    if (transcriptEditorRef.current) {
      transcriptEditorRef.current.setTextContent('');
    }
    updateActiveReport({ transcriptText: '', isStale: true });
    setLastInsertedText('');
  }, [updateActiveReport]);

  const handleNormalizeTranscript = useCallback(() => {
    if (!activeReport) return;

    const currentText = transcriptEditorRef.current?.getTextContent() || activeReport.transcriptText;
    const normalized = applyCorrections(currentText, corrections);

    if (transcriptEditorRef.current) {
      transcriptEditorRef.current.setTextContent(normalized);
    }
    updateActiveReport({ transcriptText: normalized, isStale: true });
    toast.success('Transkript normalisiert');
  }, [activeReport, corrections, updateActiveReport]);

  const handleNormalizeLastInsert = useCallback(() => {
    if (!lastInsertedText || !activeReport) return;

    const normalizedInsert = applyCorrections(lastInsertedText, corrections);
    if (normalizedInsert === lastInsertedText) {
      toast.info('Keine Änderungen');
      return;
    }

    const currentText = transcriptEditorRef.current?.getTextContent() || activeReport.transcriptText;
    const lastIdx = currentText.lastIndexOf(lastInsertedText);

    if (lastIdx >= 0) {
      const newText = currentText.slice(0, lastIdx) + normalizedInsert + currentText.slice(lastIdx + lastInsertedText.length);
      if (transcriptEditorRef.current) {
        transcriptEditorRef.current.setTextContent(newText);
      }
      updateActiveReport({ transcriptText: newText, isStale: true });
      setLastInsertedText(normalizedInsert);
      toast.success('Letzten Eintrag normalisiert');
    }
  }, [lastInsertedText, activeReport, corrections, updateActiveReport]);

  const handleProcessReport = useCallback(async () => {
    if (!activeReport || !selectedTemplate) {
      toast.error('Bitte Template auswählen');
      return;
    }

    if (!activeReport.transcriptText.trim()) {
      toast.error('Transkript ist leer');
      return;
    }

    setIsProcessing(true);
    setReportError(null);
    setIsFallbackMode(false);

    if (selectedModel === 'expert') {
      toast.info('Experte analysiert medizinische Zusammenhänge...', {
        duration: 5000,
      });
    }

    try {
      if (transcriptEditorRef.current) {
        transcriptEditorRef.current.triggerSync();
      }

      const currentTranscript = transcriptEditorRef.current?.getTextContent() || activeReport.transcriptText;

      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          normalBefundText: selectedTemplate.normalBefundText,
          clinicalData: activeReport.clinicalData,
          transcriptText: currentTranscript,
          modelMode: selectedModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const result = await response.json();

        if (result.finalReportHtml) {
          updateActiveReport({
            finalReportHtml: result.finalReportHtml,
            isStale: false,
            templateId: effectiveTemplateId,
            didYouKnow: result.didYouKnow,
            icd10: result.icd10
          });

          if (result.usedFallback) {
            setIsFallbackMode(true);
            const errorMsg = result.error?.message || 'Fallback verwendet';
            setReportError(errorMsg);
            toast.warning('Fallback (ohne LLM): ' + errorMsg);
          } else {
            setIsFallbackMode(false);
            setReportError(null);
            toast.success('Bericht generiert');
          }
        } else {
          throw new Error('Keine finalReportHtml in Antwort');
        }
      } else {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Kein Stream verfügbar');
        }

        let streamedText = '';
        let done = false;

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;

          if (value) {
            const chunk = decoder.decode(value, { stream: !done });
            streamedText += chunk;
          }
        }

        const endMarker = '\n\n__END__\n';
        const endIndex = streamedText.indexOf(endMarker);

        if (endIndex === -1) {
          throw new Error('Stream-Format ungültig');
        }

        const jsonPart = streamedText.substring(endIndex + endMarker.length);
        const result = JSON.parse(jsonPart);

        if (result.ok && result.finalReportHtml) {
          updateActiveReport({
            finalReportHtml: result.finalReportHtml,
            isStale: false,
            templateId: effectiveTemplateId,
            didYouKnow: result.didYouKnow,
            icd10: result.icd10
          });

          if (result.usedFallback) {
            setIsFallbackMode(true);
            const errorMsg = result.error?.message || 'Fallback verwendet';
            setReportError(errorMsg);
            toast.warning('Fallback (ohne LLM): ' + errorMsg);
          } else {
            setIsFallbackMode(false);
            setReportError(null);
            toast.success('Bericht generiert');
          }
        } else {
          throw new Error(result.error?.message || 'Stream-Verarbeitung fehlgeschlagen');
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Fehler bei Verarbeitung';
      setReportError(`${errMsg}`);
      toast.error(errMsg);
      console.error(e);

      try {
        const currentTranscript = transcriptEditorRef.current?.getTextContent() || activeReport.transcriptText;
        const { html } = processReport(
          currentTranscript,
          selectedTemplate,
          activeReport.clinicalData
        );
        updateActiveReport({
          finalReportHtml: html,
          isStale: false,
          templateId: effectiveTemplateId
        });
        setIsFallbackMode(true);
        toast.info('Lokaler Fallback verwendet');
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [activeReport, selectedTemplate, effectiveTemplateId, updateActiveReport, selectedModel]);

  const handleCopyFinalReport = useCallback(() => {
    if (!activeReport?.finalReportHtml) {
      toast.error('Kein Bericht vorhanden');
      return;
    }

    let text = stripHtmlForCopy(activeReport.finalReportHtml);

    if (activeReport.icd10) {
      text += `\n\nICD-10-Codierung: ${activeReport.icd10}`;
    }

    navigator.clipboard.writeText(text);
    toast.success('Bericht kopiert');
  }, [activeReport]);

  const handleInsertMacro = useCallback((macroText: string) => {
    if (transcriptEditorRef.current) {
      transcriptEditorRef.current.insertTextAtCursor(macroText + ' ');
      transcriptEditorRef.current.focus();
      setLastInsertedText(macroText);
      updateActiveReport({ isStale: true });
    }
  }, [updateActiveReport]);

  const handleClinicalDataChange = useCallback((field: string, value: string) => {
    if (!activeReport) return;
    const updated = { ...activeReport.clinicalData, [field]: value };
    updateActiveReport({ clinicalData: updated, isStale: true });
  }, [activeReport, updateActiveReport]);

  const handleScreenCapture = useCallback(() => {
    toast.info('Bitte Bereich mit Win+Shift+S (Windows) oder Cmd+Shift+4 (Mac) wählen und hier mit Strg+V einfügen.');
  }, []);

  const handleIndicationPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!activeReport) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();

        const blob = item.getAsFile();
        if (!blob) continue;

        try {
          setIsOcrProcessing(true);
          toast.info('KI liest Daten...');

          const formData = new FormData();
          formData.append('image', blob, 'paste.png');

          const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();

          if (data.ok && data.text) {
            const currentIndication = activeReport.clinicalData?.indication || '';
            const newIndication = currentIndication
              ? `${currentIndication}\n${data.text}`
              : data.text;
            handleClinicalDataChange('indication', newIndication);
            toast.success('Text aus Bild extrahiert');
          } else {
            throw new Error(data.error?.message || 'OCR fehlgeschlagen');
          }
        } catch (error: any) {
          console.error('OCR error:', error);
          toast.error('Fehler beim Lesen: ' + (error.message || 'Unbekannter Fehler'));
        } finally {
          setIsOcrProcessing(false);
        }

        break;
      }
    }
  }, [activeReport, handleClinicalDataChange]);

  const handleLabelChange = useCallback((label: string) => {
    updateActiveReport({ label });
  }, [updateActiveReport]);

  const handleBuildQueryFromReport = useCallback(() => {
    if (!activeReport || !selectedTemplate) {
      toast.error('Bitte Template auswählen');
      return;
    }

    const befundPlain = stripHtmlTags(activeReport.finalReportHtml || '');
    const beurteilungPlain = befundPlain;
    const query = buildPubMedQueryFromReport(befundPlain, beurteilungPlain, selectedTemplate.name);
    setEvidenceQuery(query);
    toast.success('Query vorgeschlagen');
  }, [activeReport, selectedTemplate]);

  const handleSearchPubMed = useCallback(async () => {
    if (!evidenceQuery.trim()) {
      toast.error('Query eingeben');
      return;
    }

    setEvidenceSearching(true);
    setEvidenceError(null);

    try {
      const searchResult = await safeFetchJson<{ ok: boolean; pmids: string[]; error?: { message: string } }>('/api/pubmed/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: evidenceQuery, retmax: 10 }),
      });

      if (!searchResult.ok || !searchResult.data || searchResult.data.pmids.length === 0) {
        toast.error('Keine Ergebnisse gefunden');
        return;
      }

      const summaryResult = await safeFetchJson<{ ok: boolean; items: Array<{ pmid: string; title: string; journal?: string; year?: string; authors?: string }>; error?: { message: string } }>('/api/pubmed/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pmids: searchResult.data.pmids }),
      });

      if (!summaryResult.ok || !summaryResult.data) {
        toast.error('Fehler beim Laden der Metadaten');
        return;
      }

      const articles: PubMedArticle[] = summaryResult.data.items.map(item => ({
        ...item,
        selected: false
      }));

      updateActiveReport({
        evidence: {
          query: evidenceQuery,
          results: articles,
          notes: activeReport?.evidence?.notes || '',
          lastUpdatedAt: Date.now()
        }
      });

      toast.success(`${articles.length} Artikel gefunden`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Fehler bei PubMed-Suche';
      setEvidenceError(errMsg);
      toast.error(errMsg);
    } finally {
      setEvidenceSearching(false);
    }
  }, [evidenceQuery, activeReport, updateActiveReport]);

  const handleToggleArticleSelection = useCallback((pmid: string) => {
    if (!activeReport?.evidence) return;

    const updatedResults = activeReport.evidence.results.map(article =>
      article.pmid === pmid ? { ...article, selected: !article.selected } : article
    );

    updateActiveReport({
      evidence: {
        ...activeReport.evidence,
        results: updatedResults
      }
    });
  }, [activeReport, updateActiveReport]);

  const handleSelectTopArticles = useCallback((count: number) => {
    if (!activeReport?.evidence) return;

    const updatedResults = activeReport.evidence.results.map((article, idx) => ({
      ...article,
      selected: idx < count
    }));

    updateActiveReport({
      evidence: {
        ...activeReport.evidence,
        results: updatedResults
      }
    });

    toast.success(`Top ${count} ausgewählt`);
  }, [activeReport, updateActiveReport]);

  const handleGenerateEvidenceNotes = useCallback(async () => {
    if (!activeReport?.evidence || !selectedTemplate) {
      toast.error('Bitte Artikel auswählen');
      return;
    }

    const selectedArticles = activeReport.evidence.results.filter(a => a.selected);

    if (selectedArticles.length === 0) {
      toast.error('Mindestens 1 Artikel auswählen');
      return;
    }

    setEvidenceGenerating(true);
    setEvidenceError(null);

    try {
      const abstractsResult = await safeFetchJson<{ ok: boolean; items: Array<{ pmid: string; abstract?: string }>; error?: { message: string } }>('/api/pubmed/abstracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pmids: selectedArticles.map(a => a.pmid) }),
      });

      const articlesWithAbstracts = selectedArticles.map(article => {
        const abstractItem = abstractsResult.data?.items?.find(item => item.pmid === article.pmid);
        return {
          ...article,
          abstract: abstractItem?.abstract
        };
      });

      const befundPlain = stripHtmlTags(activeReport.finalReportHtml || '');
      const beurteilungPlain = befundPlain;

      const notesResult = await safeFetchJson<{ ok: boolean; usedFallback: boolean; notes: string; error?: { message: string } }>('/api/evidence/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyName: selectedTemplate.name,
          befundTextPlain: befundPlain,
          beurteilungPlain: beurteilungPlain,
          query: activeReport.evidence.query,
          selectedArticles: articlesWithAbstracts
        }),
      });

      if (!notesResult.ok || !notesResult.data) {
        toast.error('Fehler beim Generieren der Notizen');
        return;
      }

      updateActiveReport({
        evidence: {
          ...activeReport.evidence,
          notes: notesResult.data.notes,
          lastUpdatedAt: Date.now()
        }
      });

      if (notesResult.data.usedFallback) {
        toast.warning('Fallback verwendet');
      } else {
        toast.success('Evidenz-Notizen generiert');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Fehler bei Generierung';
      setEvidenceError(errMsg);
      toast.error(errMsg);
    } finally {
      setEvidenceGenerating(false);
    }
  }, [activeReport, selectedTemplate, updateActiveReport]);

  const handleCopyEvidenceNotes = useCallback(() => {
    if (!activeReport?.evidence?.notes) {
      toast.error('Keine Notizen vorhanden');
      return;
    }

    navigator.clipboard.writeText(activeReport.evidence.notes);
    toast.success('Notizen kopiert');
  }, [activeReport]);

  const handleApplyEvidenceToBeurteilung = useCallback(() => {
    if (!activeReport?.evidence?.notes || !activeReport.finalReportHtml) {
      toast.error('Keine Notizen vorhanden');
      return;
    }

    const currentHtml = activeReport.finalReportHtml;
    const evidenceBlock = `\n\n<p><strong>Evidenz-Notiz (allgemein, nicht patientenspezifisch):</strong></p>\n<div class="evidence-note">${activeReport.evidence.notes.replace(/\n/g, '<br/>')}</div>`;

    if (currentHtml.includes('Evidenz-Notiz')) {
      toast.warning('Evidenz bereits eingefügt');
      return;
    }

    const updatedHtml = currentHtml + evidenceBlock;

    updateActiveReport({
      finalReportHtml: updatedHtml
    });

    toast.success('Evidenz in Beurteilung eingefügt');
  }, [activeReport, updateActiveReport]);

  const handleAddCorrection = useCallback((wrong: string, correct: string) => {
    if (!wrong.trim()) {
      toast.error('Quelltext fehlt');
      return;
    }
    const newEntry = createCorrectionEntry(wrong.trim(), correct.trim());
    const updated = [...corrections, newEntry];
    setCorrections(updated);
    saveCorrections(updated);
    toast.success('Eintrag hinzugefügt');
    return newEntry.id;
  }, [corrections]);

  const handleQuickAddFromSelection = useCallback(() => {
    if (!selectedText.trim()) {
      toast.error('Zuerst Text auswählen');
      return;
    }
    const id = handleAddCorrection(selectedText, '');
    if (id) {
      setExpandedEntryId(id);
      setSelectedText('');
    }
  }, [selectedText, handleAddCorrection]);

  const handleUpdateCorrection = useCallback((id: string, updates: Partial<CorrectionEntry>) => {
    setCorrections(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      saveCorrections(updated);
      return updated;
    });
  }, []);

  const handleRemoveCorrection = useCallback((id: string) => {
    const updated = corrections.filter(c => c.id !== id);
    setCorrections(updated);
    saveCorrections(updated);
  }, [corrections]);

  const handleAddMacro = useCallback(() => {
    if (!newMacroTitle.trim() || !newMacroText.trim()) {
      toast.error('Titel und Text ausfüllen');
      return;
    }
    const newMacro: Macro = {
      id: `macro-${Date.now()}`,
      title: newMacroTitle.trim(),
      text: newMacroText.trim(),
    };
    const updated = [...macros, newMacro];
    setMacros(updated);
    saveMacros(updated);
    setNewMacroTitle('');
    setNewMacroText('');
    toast.success('Makro hinzugefügt');
  }, [macros, newMacroTitle, newMacroText]);

  const handleRemoveMacro = useCallback((macroId: string) => {
    const updated = macros.filter(m => m.id !== macroId);
    setMacros(updated);
    saveMacros(updated);
  }, [macros]);

  const handleFinalReportExecCommand = useCallback((command: string) => {
    document.execCommand(command, false);
  }, []);

  const updateTemplate = useCallback((templateId: string, updates: Partial<Template>) => {
    setTemplates(prev => {
      const updated = prev.map(t => {
        if (t.id === templateId) {
          const updatedTemplate = { ...t, ...updates };

          saveTemplateToFirebase(updatedTemplate).catch(error => {
            console.warn('Failed to save template to Firebase:', error);
          });

          return updatedTemplate;
        }
        return t;
      });
      saveTemplates(updated);
      return updated;
    });
  }, []);

  const handleNewTemplate = useCallback(() => {
    const newTpl = createNewTemplate();
    setTemplates(prev => {
      const updated = [...prev, newTpl];
      saveTemplates(updated);

      saveTemplateToFirebase(newTpl).catch(error => {
        console.warn('Failed to save new template to Firebase:', error);
      });

      return updated;
    });
    setSelectedEditorTemplateId(newTpl.id);
    toast.success('Neue Vorlage erstellt');
  }, []);

  const handleDeleteTemplate = useCallback((templateId: string) => {
    setTemplates(prev => {
      const updated = prev.filter(t => t.id !== templateId);
      saveTemplates(updated);

      deleteTemplateFromFirebase(templateId).catch(error => {
        console.warn('Failed to delete template from Firebase:', error);
      });

      if (selectedEditorTemplateId === templateId) {
        setSelectedEditorTemplateId(updated.length > 0 ? updated[0].id : null);
      }

      return updated;
    });
    toast.success('Vorlage gelöscht');
  }, [selectedEditorTemplateId]);

  const handleSeedAllTemplates = useCallback(() => {
    seedAllTemplates();
    setTemplates(loadTemplates());
    toast.success('37 Seed-Templates geladen');
  }, []);

  const handleAppendMissingSeedTemplates = useCallback(() => {
    const count = appendMissingSeedTemplates();
    if (count > 0) {
      setTemplates(loadTemplates());
      toast.success(`${count} fehlende Templates hinzugefügt`);
    } else {
      toast.info('Keine fehlenden Templates');
    }
  }, []);

  const handleOpenAdminModal = useCallback(() => {
    setShowAdminModal(true);
    setAdminPassword('');
    setIsAdminAuthenticated(false);
  }, []);

  const handleAdminLogin = useCallback(async () => {
    const ADMIN_PASSWORD = 'admin123';

    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);

      const prompt = await getSystemPrompt();
      if (prompt) {
        setSystemPromptText(prompt);
      } else {
        setSystemPromptText('');
      }

      toast.success('Authentifiziert');
    } else {
      toast.error('Falsches Passwort');
      setAdminPassword('');
    }
  }, [adminPassword]);

  const handleSaveSystemPrompt = useCallback(async () => {
    if (!systemPromptText.trim()) {
      toast.error('Prompt darf nicht leer sein');
      return;
    }

    setIsSavingPrompt(true);

    try {
      const success = await saveSystemPrompt(systemPromptText);

      if (success) {
        toast.success('System-Prompt gespeichert');
      } else {
        toast.warning('Firebase nicht konfiguriert - lokaler Fallback aktiv');
      }
    } catch (error) {
      toast.error('Fehler beim Speichern');
    } finally {
      setIsSavingPrompt(false);
    }
  }, [systemPromptText]);

  const handleCloseAdminModal = useCallback(() => {
    setShowAdminModal(false);
    setAdminPassword('');
    setIsAdminAuthenticated(false);
    setSystemPromptText('');
  }, []);

  const groupedReports = useMemo(() => groupReportsByDate(reports), [reports]);

  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return templates;
    const lower = templateSearch.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.keywords.some(k => k.toLowerCase().includes(lower))
    );
  }, [templates, templateSearch]);

  useEffect(() => {
    initializeFirebase();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Toaster />

      <div className="bg-white border-b px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">RadAssist v{APP_VERSION}</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenAdminModal}
              className="h-8"
              title="KI-Konfiguration"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <Alert variant="destructive" className="w-auto py-1 px-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Demo - keine PHI/PAT-Daten
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <Tabs defaultValue="report" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-white px-4 flex-shrink-0">
          <TabsList className="h-10">
            <TabsTrigger value="report">Befundung</TabsTrigger>
            <TabsTrigger value="templates" className="text-gray-400 data-[state=active]:text-foreground">Vorlagen-Editor</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="report" className="flex-1 m-0 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="bg-white border-b px-4 py-2 flex-shrink-0">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium whitespace-nowrap">
                    Template<span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={effectiveTemplateId || ''}
                    onValueChange={handleManualTemplateChange}
                    disabled={isProcessing}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Template wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeReport?.manualTemplateOverride ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEnableAutoTemplate}
                      title="Entsperren (Auto-Auswahl aktivieren)"
                    >
                      <Lock className="h-4 w-4 text-amber-600" />
                    </Button>
                  ) : (
                    <Unlock className="h-4 w-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoSuggest}
                    onCheckedChange={setAutoSuggest}
                    id="auto-suggest"
                  />
                  <label htmlFor="auto-suggest" className="text-xs text-gray-500">
                    Auto
                  </label>
                </div>

                <TooltipProvider delayDuration={300}>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSelectedModel('standard')}
                          disabled={isProcessing}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                            selectedModel === 'standard'
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          <Zap className="h-4 w-4" />
                          Standard
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Modell: GPT-4o-mini (Schnell & Effizient)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSelectedModel('expert')}
                          disabled={isProcessing}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                            selectedModel === 'expert'
                              ? 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-800 shadow-sm border border-amber-200'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          <Brain className="h-4 w-4" />
                          Experte
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Modell: o1-mini (Tiefes logisches Verständnis)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            toast.info("Feature 'Local LLM' folgt in Kürze. Bitte Standard nutzen.");
                          }}
                          disabled={isProcessing}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all text-gray-600 hover:text-gray-900`}
                        >
                          <Server className="h-4 w-4" />
                          OpenLLM
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Modell: Llama 3 (Lokal/Demo - Datenschutz-Fokus)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                {llmStatus.checked && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={llmStatus.configured ? 'text-green-600' : 'text-amber-600'}>
                      {llmStatus.configured ? 'LLM aktiv' : 'Fallback'}
                    </span>
                  </div>
                )}

                {activeReport?.isStale && activeReport.finalReportHtml && (
                  <div className="flex items-center gap-2 text-amber-600 text-xs">
                    <RefreshCw className="h-3 w-3" />
                    <span>Änderungen - erneut verarbeiten</span>
                  </div>
                )}
              </div>

              {autoSuggest && rankedTemplates.length > 0 && rankedTemplates[0].score > 0 && (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="text-gray-500">Vorschläge:</span>
                  {rankedTemplates.slice(0, 3).filter(r => r.score > 0).map((r, idx) => (
                    <button
                      key={r.template.id}
                      onClick={() => handleManualTemplateChange(r.template.id)}
                      className={`px-2 py-1 rounded ${
                        r.template.id === effectiveTemplateId
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {idx === 0 && !activeReport?.manualTemplateOverride && '> '}{r.template.name}
                      <span className="ml-1 text-gray-400">
                        ({r.score} / {r.confidence})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-52 border-r bg-white flex flex-col flex-shrink-0">
                <div className="p-2 border-b">
                  <Button onClick={handleNewReport} className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Neuer Bericht
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {Object.entries(groupedReports).map(([dateKey, dateReports]) => (
                      <div key={dateKey} className="mb-3">
                        <div className="text-xs font-medium text-gray-500 px-2 mb-1">
                          {dateKey}
                        </div>
                        {dateReports.map(report => {
                          const template = templates.find(t => t.id === report.templateId);
                          return (
                            <div
                              key={report.id}
                              onClick={() => handleSelectReport(report.id)}
                              className={`p-2 rounded cursor-pointer mb-1 group ${
                                activeReportId === report.id
                                  ? 'bg-blue-100 border border-blue-300'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-1 text-sm truncate">
                                  <FileText className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                  <span className="truncate">
                                    {report.label || template?.name || 'Unbenannt'}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteReport(report.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {report.status === 'final' ? 'Final' : 'Entwurf'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {reports.length === 0 && (
                      <div className="text-center text-sm text-gray-400 py-8">
                        Keine Berichte
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
                <div className="flex-1 bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden min-h-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-medium">Transkript</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        onClick={handleClearTranscript}
                        variant="ghost"
                        size="sm"
                        disabled={!activeReport}
                        className="flex-shrink-0"
                      >
                        <Eraser className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          if (useServerASR) {
                            isServerRecording ? stopServerRecording() : startServerRecording();
                          } else {
                            isListening ? stopListening() : startListening();
                          }
                          setAsrError(null);
                          clearServerASRError();
                        }}
                        disabled={(!isSupported && !useServerASR) || !activeReport || isServerUploading}
                        variant={(isListening || isServerRecording) ? 'destructive' : 'default'}
                        size="sm"
                        className="flex-shrink-0 min-w-[80px]"
                      >
                        {(isListening || isServerRecording) ? (
                          <>
                            <MicOff className="h-4 w-4 mr-1" />
                            Stop
                          </>
                        ) : isServerUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ...
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4 mr-1" />
                            Diktat
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleProcessReport}
                        disabled={!canProcess || isProcessing}
                        size="sm"
                        className={`flex-shrink-0 min-w-[110px] ${
                          selectedModel === 'expert'
                            ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800'
                            : ''
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            {selectedModel === 'expert' ? 'Analysiert...' : '...'}
                          </>
                        ) : (
                          <>
                            {selectedModel === 'expert' ? (
                              <Brain className="h-4 w-4 mr-1" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-1" />
                            )}
                            Generieren
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <div className="px-3 py-1 border-b bg-gray-50 text-xs text-gray-500 italic flex-shrink-0">
                      Spracherkennung am Besten mit DMO
                    </div>
                    <div className="px-3 py-1 border-b bg-gray-100 text-sm text-gray-500 flex-shrink-0 min-h-[28px]">
                      {asrError || serverASRError ? (
                        <span className="text-red-600 font-medium">
                          {asrError || serverASRError?.message}
                        </span>
                      ) : isServerUploading ? (
                        <span className="text-blue-500 italic flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Transkribiere...
                        </span>
                      ) : isServerRecording ? (
                        <span className="text-red-500 italic">Aufnahme (Server)...</span>
                      ) : isListening && interimTranscript ? (
                        <span className="italic">
                          <span className="text-red-500 font-medium mr-1">Live:</span>
                          {interimTranscript}
                        </span>
                      ) : isListening ? (
                        <span className="text-red-500 italic">Aufnahme läuft...</span>
                      ) : (
                        <span className="text-gray-300">Live-Vorschau</span>
                      )}
                    </div>

                    <div className="flex-1 overflow-auto p-3 min-h-0 relative">
                      {!activeReport?.transcriptText && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-gray-400 text-sm">Warte auf Diktat-Eingabe...</span>
                        </div>
                      )}
                      <ContentEditableEditor
                        ref={transcriptEditorRef}
                        value={activeReport?.transcriptText || ''}
                        onChange={handleTranscriptChange}
                        placeholder=""
                        className="min-h-full text-base leading-relaxed focus:outline-none"
                        readOnly={!activeReport}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden min-h-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Befund & Beurteilung</span>
                      {isFallbackMode && (
                        <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                          Fallback (ohne LLM)
                        </span>
                      )}
                      {reportError && (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                          {reportError}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => handleFinalReportExecCommand('bold')}>
                        <Bold className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleFinalReportExecCommand('italic')}>
                        <Italic className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleFinalReportExecCommand('underline')}>
                        <Underline className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleFinalReportExecCommand('removeFormat')}>
                        <Eraser className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-gray-300 mx-1" />
                      <Button
                        onClick={handleCopyFinalReport}
                        disabled={!activeReport?.finalReportHtml}
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Kopieren
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-3 min-h-0">
                    <ContentEditableEditor
                      ref={finalReportEditorRef}
                      value={processedFinalReportHtml}
                      onChange={handleFinalReportChange}
                      placeholder="Bericht wird nach Verarbeitung hier angezeigt..."
                      className="min-h-full text-sm leading-relaxed focus:outline-none prose prose-sm max-w-none"
                      useHtml={true}
                      readOnly={!activeReport}
                    />
                  </div>
                  {activeReport?.icd10 && (
                    <div className="border-t bg-gray-50 px-3 py-2 flex-shrink-0">
                      <div className="text-xs text-gray-600">
                        <span className="font-semibold">ICD-10-Codierung:</span> {activeReport.icd10}
                      </div>
                    </div>
                  )}
                </div>

                {activeReport?.didYouKnow && (
                  <div className="bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
                      <span className="text-sm font-medium">Wissenswertes</span>
                    </div>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-gray-700 leading-relaxed">{activeReport.didYouKnow.fact}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.open(`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(activeReport.didYouKnow!.pubmedSearchTerm)}`, '_blank');
                        }}
                        className="h-7 text-xs flex-shrink-0"
                      >
                        <Search className="h-3 w-3 mr-1" />
                        Auf PubMed prüfen
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-64 border-l bg-white flex flex-col flex-shrink-0 overflow-hidden">
                <ScrollArea className="flex-1">
                  <Accordion type="multiple" value={dictionaryAccordionOpen} onValueChange={setDictionaryAccordionOpen} className="px-2 py-2">
                    <AccordionItem value="dictionary">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        <div className="flex items-center gap-2">
                          <span>Radiologie-Wörterbuch</span>
                          <span className="text-xs text-gray-500">({corrections.length} Einträge)</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {selectedText && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleQuickAddFromSelection}
                              className="w-full h-7 text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Auswahl hinzufügen: "{selectedText.slice(0, 20)}"
                            </Button>
                          )}
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                            <Input
                              value={dictSearch}
                              onChange={(e) => setDictSearch(e.target.value)}
                              placeholder="Suchen..."
                              className="h-7 text-xs pl-7"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleNormalizeTranscript}
                              disabled={!activeReport?.transcriptText}
                              className="h-6 text-[10px] flex-1 px-1"
                              title="Wörterbuch auf ganzes Transkript anwenden"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Normalisieren
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleNormalizeLastInsert}
                              disabled={!lastInsertedText}
                              className="h-6 text-[10px] flex-1 px-1"
                              title="Letzten Eintrag normalisieren"
                            >
                              Letzten
                            </Button>
                          </div>

                          <div className="border rounded max-h-48 overflow-y-auto">
                            <div className="p-2 space-y-1">
                              {filteredCorrections.map(entry => (
                                <div key={entry.id} className="border rounded bg-white text-xs">
                                  <div
                                    className="flex items-center gap-1 p-1 cursor-pointer hover:bg-gray-50"
                                    onClick={() => setExpandedEntryId(
                                      expandedEntryId === entry.id ? null : entry.id
                                    )}
                                  >
                                    {expandedEntryId === entry.id ? (
                                      <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className="text-gray-500 truncate flex-1 text-[10px]">{entry.wrong}</span>
                                    <span className="text-gray-300 flex-shrink-0">→</span>
                                    <span className="font-medium truncate flex-1 text-[10px]">{entry.correct || '...'}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveCorrection(entry.id);
                                      }}
                                      className="p-0.5 hover:text-red-500 flex-shrink-0"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>

                                  {expandedEntryId === entry.id && (
                                    <div className="px-2 pb-2 pt-1 border-t bg-gray-50 space-y-2">
                                      <div className="grid grid-cols-2 gap-1">
                                        <div>
                                          <label className="text-[10px] text-gray-500">Von</label>
                                          <Input
                                            value={entry.wrong}
                                            onChange={(e) => handleUpdateCorrection(entry.id, { wrong: e.target.value })}
                                            className="h-6 text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-gray-500">Zu</label>
                                          <Input
                                            value={entry.correct}
                                            onChange={(e) => handleUpdateCorrection(entry.id, { correct: e.target.value })}
                                            className="h-6 text-xs"
                                            autoFocus={!entry.correct}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <label className="flex items-center gap-1 text-[10px] text-gray-500">
                                          <Checkbox
                                            checked={entry.caseInsensitive}
                                            onCheckedChange={(checked) =>
                                              handleUpdateCorrection(entry.id, { caseInsensitive: !!checked })
                                            }
                                            className="h-3 w-3"
                                          />
                                          Groß/Klein
                                        </label>
                                        <label className="flex items-center gap-1 text-[10px] text-gray-500">
                                          <Checkbox
                                            checked={entry.wholeWord}
                                            onCheckedChange={(checked) =>
                                              handleUpdateCorrection(entry.id, { wholeWord: !!checked })
                                            }
                                            className="h-3 w-3"
                                          />
                                          Ganzes Wort
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const id = handleAddCorrection('', '');
                                  if (id) setExpandedEntryId(id);
                                }}
                                className="w-full h-6 text-[10px] mt-1"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Neuer Eintrag
                              </Button>
                            </div>
                          </div>

                          <p className="text-[9px] text-gray-400 leading-tight">
                            Korrigiert systematische Fehler. Fehlende Wörter kann es nicht ergänzen.
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="clinical">
                      <AccordionTrigger className="text-sm font-medium py-2">
                        Klinische Angaben
                      </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-gray-500">Indikation</label>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleScreenCapture}
                              disabled={!activeReport || isOcrProcessing}
                              className="h-6 px-2 text-xs"
                              title="Vom Bildschirm erfassen"
                            >
                              {isOcrProcessing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Camera className="h-3 w-3" />
                              )}
                              <span className="ml-1">Erfassen</span>
                            </Button>
                          </div>
                          <Textarea
                            value={activeReport?.clinicalData?.indication || ''}
                            onChange={(e) => handleClinicalDataChange('indication', e.target.value)}
                            onPaste={handleIndicationPaste}
                            onBlur={() => {
                              if (activeReport?.finalReportHtml && !isProcessing) {
                                handleProcessReport();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (activeReport?.finalReportHtml && !isProcessing) {
                                  handleProcessReport();
                                }
                              }
                            }}
                            placeholder="..."
                            className="text-sm min-h-[60px] resize-y"
                            disabled={!activeReport}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Fragestellung</label>
                          <Textarea
                            value={activeReport?.clinicalData?.fragestellung || ''}
                            onChange={(e) => handleClinicalDataChange('fragestellung', e.target.value)}
                            onBlur={() => {
                              if (activeReport?.finalReportHtml && !isProcessing) {
                                handleProcessReport();
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (activeReport?.finalReportHtml && !isProcessing) {
                                  handleProcessReport();
                                }
                              }
                            }}
                            placeholder="..."
                            className="text-sm min-h-[60px] resize-y"
                            disabled={!activeReport}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Technik</label>
                          <Input
                            value={activeReport?.clinicalData?.technik || ''}
                            onChange={(e) => handleClinicalDataChange('technik', e.target.value)}
                            placeholder="..."
                            className="text-sm h-8"
                            disabled={!activeReport}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Kontrastmittel</label>
                          <Input
                            value={activeReport?.clinicalData?.kontrastmittel || ''}
                            onChange={(e) => handleClinicalDataChange('kontrastmittel', e.target.value)}
                            placeholder="..."
                            className="text-sm h-8"
                            disabled={!activeReport}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Voruntersuchungen</label>
                          <Input
                            value={activeReport?.clinicalData?.voruntersuchungen || ''}
                            onChange={(e) => handleClinicalDataChange('voruntersuchungen', e.target.value)}
                            placeholder="..."
                            className="text-sm h-8"
                            disabled={!activeReport}
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="macros">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      Makros
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1">
                        {macros.map(macro => (
                          <div key={macro.id} className="flex items-center gap-1 group">
                            <button
                              onClick={() => handleInsertMacro(macro.text)}
                              disabled={!activeReport}
                              className="flex-1 text-left text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded truncate disabled:opacity-50"
                            >
                              {macro.title}
                            </button>
                            <button
                              onClick={() => handleRemoveMacro(macro.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <div className="border-t pt-2 mt-2 space-y-1">
                          <Input
                            value={newMacroTitle}
                            onChange={(e) => setNewMacroTitle(e.target.value)}
                            placeholder="Titel..."
                            className="text-xs h-7"
                          />
                          <Textarea
                            value={newMacroText}
                            onChange={(e) => setNewMacroText(e.target.value)}
                            placeholder="Text..."
                            className="text-xs min-h-[40px]"
                          />
                          <Button onClick={handleAddMacro} size="sm" className="w-full h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            Hinzufügen
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="label">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      Label
                    </AccordionTrigger>
                    <AccordionContent>
                      <Input
                        value={activeReport?.label || ''}
                        onChange={(e) => handleLabelChange(e.target.value)}
                        placeholder="Bericht-Label..."
                        className="text-sm h-8"
                        disabled={!activeReport}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="evidence">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      Evidenz-Check
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500">Query (de-identifiziert)</label>
                          <Input
                            value={evidenceQuery}
                            onChange={(e) => setEvidenceQuery(e.target.value)}
                            placeholder="z.B. incidental liver lesion CT follow-up"
                            className="text-sm h-8 mb-2"
                            disabled={!activeReport}
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={handleBuildQueryFromReport}
                              disabled={!activeReport || !activeReport.finalReportHtml}
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-xs"
                            >
                              Vorschlag aus Befund
                            </Button>
                            <Button
                              onClick={handleSearchPubMed}
                              disabled={!activeReport || !evidenceQuery.trim() || evidenceSearching}
                              size="sm"
                              className="flex-1 h-7 text-xs"
                            >
                              {evidenceSearching ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ...
                                </>
                              ) : (
                                <>
                                  <Search className="h-3 w-3 mr-1" />
                                  Suchen
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {activeReport?.evidence?.results && activeReport.evidence.results.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs text-gray-500">Ergebnisse ({activeReport.evidence.results.length})</label>
                              <Button
                                onClick={() => handleSelectTopArticles(3)}
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                              >
                                Top 3
                              </Button>
                            </div>
                            <ScrollArea className="h-48 border rounded">
                              <div className="p-2 space-y-2">
                                {activeReport.evidence.results.map(article => (
                                  <div key={article.pmid} className="border rounded bg-white p-2 text-xs">
                                    <label className="flex items-start gap-2 cursor-pointer">
                                      <Checkbox
                                        checked={article.selected}
                                        onCheckedChange={() => handleToggleArticleSelection(article.pmid)}
                                        className="h-3 w-3 mt-0.5 flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-[11px] leading-tight mb-1">{article.title}</div>
                                        <div className="text-[10px] text-gray-500">
                                          {article.journal && <span>{article.journal}, </span>}
                                          {article.year && <span>{article.year} - </span>}
                                          <span className="font-mono">PMID: {article.pmid}</span>
                                        </div>
                                      </div>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                            <Button
                              onClick={handleGenerateEvidenceNotes}
                              disabled={!activeReport.evidence.results.some(a => a.selected) || evidenceGenerating}
                              size="sm"
                              className="w-full h-7 text-xs mt-2"
                            >
                              {evidenceGenerating ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Generiere...
                                </>
                              ) : (
                                <>
                                  <Book className="h-3 w-3 mr-1" />
                                  Evidence Notes generieren
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {activeReport?.evidence?.notes && (
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Evidence Notes</label>
                            <Textarea
                              value={activeReport.evidence.notes}
                              readOnly
                              className="text-xs min-h-[120px] bg-gray-50 font-mono"
                            />
                            <div className="flex gap-2 mt-2">
                              <Button
                                onClick={handleCopyEvidenceNotes}
                                size="sm"
                                variant="outline"
                                className="flex-1 h-7 text-xs"
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Kopieren
                              </Button>
                              <Button
                                onClick={handleApplyEvidenceToBeurteilung}
                                size="sm"
                                className="flex-1 h-7 text-xs"
                              >
                                In Beurteilung übernehmen
                              </Button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 italic">
                              Hinweis: Evidenz-Notizen sind allgemeine Literaturhinweise (nicht patientenspezifisch). Keine Patientendaten verwenden.
                            </p>
                          </div>
                        )}

                        {evidenceError && (
                          <Alert variant="destructive" className="py-2">
                            <AlertDescription className="text-xs">{evidenceError}</AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="feedback">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      LLM-Modellverbesserung
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Kommentar zur Verbesserung des LLMs..."
                          className="text-sm min-h-[80px]"
                          disabled={!activeReport}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            toast.success('Danke für Ihr Feedback!');
                          }}
                          disabled={!activeReport}
                          className="w-full h-8 text-xs"
                        >
                          Feedback senden
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  </Accordion>

                  <div className="px-2 py-3 border-t">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">App-Feedback</div>
                      <Textarea
                        placeholder="Fehler gefunden oder Feature-Wunsch?"
                        className="text-sm min-h-[80px]"
                        id="app-feedback-text"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const feedbackText = (document.getElementById('app-feedback-text') as HTMLTextAreaElement)?.value || '';
                          const subject = encodeURIComponent('Feedback RadAssist');
                          const body = encodeURIComponent(feedbackText);
                          window.location.href = `mailto:philipp.steiger@hirslanden.ch?subject=${subject}&body=${body}`;
                        }}
                        className="w-full h-8 text-xs"
                      >
                        Feedback per Mail senden
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="flex-1 m-0 overflow-hidden">
          <div className="h-full flex">
            <div className="w-56 border-r bg-white flex flex-col flex-shrink-0">
              <div className="p-2 border-b space-y-2">
                <Input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Suchen..."
                  className="h-8 text-sm"
                />
                <Button onClick={handleNewTemplate} size="sm" className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Neue Vorlage
                </Button>
                <Button onClick={handleSeedAllTemplates} size="sm" variant="outline" className="w-full">
                  Seed templates (37)
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredTemplates.map(template => (
                    <div
                      key={template.id}
                      onClick={() => setSelectedEditorTemplateId(template.id)}
                      className={`p-2 rounded cursor-pointer group ${
                        selectedEditorTemplateId === template.id
                          ? 'bg-blue-100 border border-blue-300'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-medium truncate">{template.name}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {template.keywords.slice(0, 3).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {editorTemplate ? (
                <>
                  <div className="p-3 border-b bg-gray-50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                      <Input
                        value={editorTemplate.name}
                        onChange={(e) => updateTemplate(editorTemplate.id, { name: e.target.value })}
                        className="font-medium flex-1"
                        placeholder="Template-Name"
                      />
                      <Button
                        onClick={() => {
                          saveTemplates(templates);
                          toast.success('Gespeichert');
                        }}
                        size="sm"
                      >
                        Speichern
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-hidden p-3">
                      <h3 className="text-sm font-medium mb-2">Normalbefund (Befund)</h3>
                      <Textarea
                        value={editorTemplate.normalBefundText}
                        onChange={(e) => updateTemplate(editorTemplate.id, { normalBefundText: e.target.value, updatedAt: Date.now() })}
                        placeholder="Normalbefund-Text hier eingeben..."
                        className="flex-1 min-h-[200px] font-mono text-sm"
                      />

                      <div className="mt-4">
                        <label className="text-xs text-gray-500 mb-2 block">Keywords (komma-getrennt)</label>
                        <Textarea
                          value={editorTemplate.keywords.join(', ')}
                          onChange={(e) => {
                            const keywords = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                            updateTemplate(editorTemplate.id, { keywords, updatedAt: Date.now() });
                          }}
                          placeholder="ct abdomen, leber, niere, milz..."
                          className="text-sm min-h-[80px]"
                        />
                        <div className="text-xs text-gray-400 mt-1">
                          Für Auto-Suggestion. Mehrere Keywords erhöhen die Trefferrate.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Vorlage auswählen
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <style jsx global>{`
        .hl {
          background-color: #bbf7d0;
          padding: 0 2px;
          border-radius: 2px;
          cursor: pointer;
        }
        .hl:hover {
          background-color: #86efac;
        }
        .gender-warning {
          background-color: rgba(239, 68, 68, 0.15);
          padding: 1px 3px;
          border-radius: 2px;
          font-weight: 500;
        }
        .prose h2, .prose h3, .prose h4 {
          margin-top: 0.75em;
          margin-bottom: 0.25em;
        }
        .prose p {
          margin: 0.5em 0;
        }
        .report-content p {
          margin: 0.5em 0;
        }
      `}</style>

      {process.env.NODE_ENV === 'development' && activeReport && (
        <div className="fixed bottom-2 left-2 text-xs bg-black text-white px-2 py-1 rounded opacity-50 font-mono">
          T:{activeReport.transcriptText.length} | Lock:{templateLocked?'Y':'N'} | Sel:{activeReport.templateId?.slice(0,8)} | Sug:{suggestedTemplateId?.slice(0,8)}
        </div>
      )}

      <div className="fixed bottom-2 right-2 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded shadow-sm border border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-medium">Deployment:</span>
          <span className="text-gray-500">Set OPENAI_API_KEY in Vercel Environment Variables for LLM</span>
        </div>
      </div>

      <Dialog open={showAdminModal} onOpenChange={handleCloseAdminModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>KI-Konfiguration</DialogTitle>
            <DialogDescription>
              System-Prompt bearbeiten (nur für Administratoren)
            </DialogDescription>
          </DialogHeader>

          {!isAdminAuthenticated ? (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Passwort</label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAdminLogin();
                    }
                  }}
                  placeholder="Passwort eingeben..."
                  className="w-full"
                  autoFocus
                />
              </div>
              <Button onClick={handleAdminLogin} className="w-full">
                Anmelden
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">System-Prompt</label>
                <Textarea
                  value={systemPromptText}
                  onChange={(e) => setSystemPromptText(e.target.value)}
                  placeholder="System-Prompt hier eingeben..."
                  className="min-h-[400px] font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Dieser Text definiert, wie sich die KI verhält und welche Regeln sie befolgt.
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSaveSystemPrompt}
                  disabled={isSavingPrompt}
                  className="w-full"
                >
                  {isSavingPrompt ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Speichern...
                    </>
                  ) : (
                    'Speichern'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
