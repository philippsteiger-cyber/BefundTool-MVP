'use client';

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface EditorHandle {
  insertTextAtCursor: (text: string) => void;
  focus: () => void;
  getContent: () => string;
  getTextContent: () => string;
  setContent: (html: string) => void;
  setTextContent: (text: string) => void;
  triggerSync: () => void;
}

interface ContentEditableEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  useHtml?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onOCRStart?: () => void;
  onOCRComplete?: (text: string) => void;
  onOCRError?: (error: string) => void;
}

const ContentEditableEditor = forwardRef<EditorHandle, ContentEditableEditorProps>(
  ({ value, onChange, placeholder, className = '', readOnly = false, useHtml = false, onFocus, onBlur, onOCRStart, onOCRComplete, onOCRError }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const isComposingRef = useRef(false);
    const isFocusedRef = useRef(false);
    const lastValueRef = useRef(value);

    const saveSelection = useCallback(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorRef.current?.contains(range.commonAncestorContainer)) {
          savedRangeRef.current = range.cloneRange();
        }
      }
    }, []);

    const restoreSelection = useCallback((): boolean => {
      if (!savedRangeRef.current || !editorRef.current) return false;

      try {
        if (!editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
          return false;
        }

        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(savedRangeRef.current);
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }, []);

    const placeCursorAtEnd = useCallback(() => {
      if (!editorRef.current) return;

      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        saveSelection();
      }
    }, [saveSelection]);

    const syncToState = useCallback(() => {
      if (!editorRef.current) return;

      const newValue = useHtml
        ? editorRef.current.innerHTML
        : editorRef.current.innerText;

      if (newValue !== lastValueRef.current) {
        lastValueRef.current = newValue;
        onChange(newValue);
      }
    }, [onChange, useHtml]);

    const insertTextAtCursor = useCallback((text: string) => {
      if (!editorRef.current) return;

      editorRef.current.focus();
      isFocusedRef.current = true;

      const restored = restoreSelection();

      if (!restored) {
        placeCursorAtEnd();
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        placeCursorAtEnd();
      }

      const range = selection?.getRangeAt(0);
      if (!range) return;

      range.deleteContents();

      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection?.removeAllRanges();
      selection?.addRange(range);

      saveSelection();
      syncToState();
    }, [restoreSelection, saveSelection, syncToState, placeCursorAtEnd]);

    useImperativeHandle(ref, () => ({
      insertTextAtCursor,
      focus: () => {
        editorRef.current?.focus();
        isFocusedRef.current = true;
      },
      getContent: () => editorRef.current?.innerHTML || '',
      getTextContent: () => editorRef.current?.innerText || '',
      setContent: (html: string) => {
        if (editorRef.current) {
          editorRef.current.innerHTML = html;
          lastValueRef.current = useHtml ? html : editorRef.current.innerText;
        }
      },
      setTextContent: (text: string) => {
        if (editorRef.current) {
          editorRef.current.innerText = text;
          lastValueRef.current = text;
        }
      },
      triggerSync: syncToState,
    }), [insertTextAtCursor, syncToState, useHtml]);

    useEffect(() => {
      if (!editorRef.current) return;

      if (isFocusedRef.current) return;

      const currentContent = useHtml
        ? editorRef.current.innerHTML
        : editorRef.current.innerText;

      if (currentContent !== value && value !== lastValueRef.current) {
        if (useHtml) {
          editorRef.current.innerHTML = value;
        } else {
          editorRef.current.innerText = value;
        }
        lastValueRef.current = value;
      }
    }, [value, useHtml]);

    const handleInput = useCallback(() => {
      if (isComposingRef.current) return;
      syncToState();
    }, [syncToState]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      saveSelection();
    }, [saveSelection]);

    const handleMouseUp = useCallback(() => {
      saveSelection();
    }, [saveSelection]);

    const handleFocus = useCallback(() => {
      isFocusedRef.current = true;
      onFocus?.();
    }, [onFocus]);

    const handleBlur = useCallback(() => {
      saveSelection();
      isFocusedRef.current = false;
      syncToState();
      onBlur?.();
    }, [onBlur, saveSelection, syncToState]);

    const handleClick = useCallback((e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('hl')) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(target);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      saveSelection();
    }, [saveSelection]);

    const handleBeforeInput = useCallback((e: React.FormEvent) => {
      const inputEvent = e.nativeEvent as InputEvent;
      if (!inputEvent.data) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      const parentEl = container.parentElement;

      if (parentEl?.classList.contains('hl')) {
        e.preventDefault();

        const textContent = parentEl.textContent || '';
        const textNode = document.createTextNode(textContent + inputEvent.data);

        parentEl.replaceWith(textNode);

        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        syncToState();
      }
    }, [syncToState]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();
          if (!file) continue;

          onOCRStart?.();

          try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/ocr', {
              method: 'POST',
              body: formData,
            });

            const result = await response.json();

            if (result.ok && result.text) {
              insertTextAtCursor(result.text);
              onOCRComplete?.(result.text);
            } else {
              const errorMsg = result.error?.message || 'OCR failed';
              onOCRError?.(errorMsg);
            }
          } catch (error: any) {
            const errorMsg = error.message || 'OCR request failed';
            onOCRError?.(errorMsg);
          }

          return;
        }
      }
    }, [insertTextAtCursor, onOCRStart, onOCRComplete, onOCRError]);

    const showPlaceholder = !value || value === '<br>' || value === '<br/>';

    return (
      <div className="relative h-full">
        <div
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          className={`${className} ${showPlaceholder ? 'empty-editor' : ''}`}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={saveSelection}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            handleInput();
          }}
          data-placeholder={placeholder}
        />
        <style jsx>{`
          .empty-editor:empty::before {
            content: attr(data-placeholder);
            color: #9ca3af;
            pointer-events: none;
          }
        `}</style>
      </div>
    );
  }
);

ContentEditableEditor.displayName = 'ContentEditableEditor';

export default ContentEditableEditor;
