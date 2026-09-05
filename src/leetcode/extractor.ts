import { EventBus, SolutionExtractedPayload, SubmissionDetectedPayload } from '../core/events';
import { logger } from '../utils/logger';

/**
 * Normalizes raw extracted solution code:
 * - Replaces non-breaking spaces (\u00A0) with standard ASCII spaces.
 * - Converts CRLF and CR to Unix LF (\n).
 * - Strips trailing whitespace and trailing blank lines.
 * - Ensures exactly one trailing newline.
 * - Preserves leading indentation and internal blank lines.
 */
export function normalizeCode(rawCode: string | null): string | null {
  if (!rawCode) return null;

  // 1. Replace Unicode non-breaking spaces (\u00A0) with standard ASCII spaces
  let normalized = rawCode.replace(/\u00A0/g, ' ');

  // 2. Convert Windows CRLF (\r\n) and legacy Mac \r line endings to Unix \n

  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Remove trailing blank lines and whitespace
  normalized = normalized.trimEnd();

  if (!normalized) return null;

  // 4. Guarantee single trailing newline
  return `${normalized}\n`;
}

/**
 * Service responsible solely for extracting solution source code from LeetCode problem pages
 * using a layered extraction pipeline:
 * 1. Monaco Model Extraction (Page-world bridge & Monaco global API)
 * 2. Monaco Editor DOM Lines (non-virtualized only)
 * 3. Textarea / Input Elements
 * 4. Semantic Code Elements (code, pre)
 */
export class SolutionExtractor {
  private unsubscribe: (() => void) | null = null;
  private isListening: boolean = false;

  /**
   * Starts listening for SubmissionDetected events on the EventBus.
   */
  start(): void {
    if (this.isListening) {
      logger.debug('[SolutionExtractor] Already listening for SubmissionDetected events.');
      return;
    }

    logger.debug('[SolutionExtractor] Starting solution extractor listener...');
    this.isListening = true;

    this.unsubscribe = EventBus.getInstance().subscribe<SubmissionDetectedPayload>(
      'SubmissionDetected',
      (event) => {
        void this.handleSubmissionDetected(event.payload);
      },
    );
  }

  /**
   * Handles incoming SubmissionDetected events and publishes SolutionExtracted upon successful code retrieval.
   */
  public async handleSubmissionDetected(
    payload: SubmissionDetectedPayload,
    doc?: Document,
  ): Promise<void> {
    logger.debug(
      `[SolutionExtractor] Received SubmissionDetected event for problem '${payload.problemSlug}'`,
    );

    const code = await this.extractSolutionCode(doc);
    if (!code) {
      logger.warn(
        `[SolutionExtractor] Failed to extract valid solution code for problem '${payload.problemSlug}'`,
      );
      return;
    }
    const finalLines = code.split('\n').length;
    logger.info(
      `[SolutionExtractor] Extracted solution for '${payload.problemSlug}' (${payload.language}): length=${code.length}, lines=${finalLines}`,
    );

    const solutionPayload: SolutionExtractedPayload = {
      problemTitle: payload.problemTitle,
      problemSlug: payload.problemSlug,
      difficulty: payload.difficulty,
      language: payload.language,
      code,
      timestamp: Date.now(),
    };

    logger.debug(
      `[SolutionExtractor] Publishing SolutionExtracted event for problem '${payload.problemSlug}'`,
    );
    EventBus.getInstance().publish('SolutionExtracted', solutionPayload);
  }

  /**
   * Attempts to extract complete solution code using a layered strategy.
   */
  public async extractSolutionCode(doc?: Document): Promise<string | null> {
    // Strategy 1a: Monaco Page-World Bridge (MAIN world communication)
    logger.info('[SolutionExtractor] Attempting Strategy 1a: Monaco Page Bridge');
    const rawBridgeCode = await this.extractFromMonacoBridge(doc);
    const bridgeCode = normalizeCode(rawBridgeCode);
    if (this.validateCode(bridgeCode)) {
      const lineCount = bridgeCode ? bridgeCode.split('\n').length : 0;
      logger.info(
        `[SolutionExtractor] Strategy 1a (Monaco Page Bridge) SUCCEEDED: rawLength=${rawBridgeCode?.length || 0}, normalizedLength=${bridgeCode?.length || 0}, lines=${lineCount}`,
      );
      return bridgeCode;
    }

    // Strategy 1b: Monaco Global API (same realm / unit test mocks)
    logger.info('[SolutionExtractor] Attempting Strategy 1b: Monaco Global API');
    const rawMonacoCode = this.extractFromMonacoApi();
    const monacoCode = normalizeCode(rawMonacoCode);
    if (this.validateCode(monacoCode)) {
      const lineCount = monacoCode ? monacoCode.split('\n').length : 0;
      logger.info(
        `[SolutionExtractor] Strategy 1b (Monaco Global API) SUCCEEDED: rawLength=${rawMonacoCode?.length || 0}, normalizedLength=${monacoCode?.length || 0}, lines=${lineCount}`,
      );
      return monacoCode;
    }

    // Strategy 2: Monaco Editor DOM Lines (.view-line) - strictly rejected if virtualized
    logger.info('[SolutionExtractor] Attempting Strategy 2: Monaco Editor DOM Lines');
    const rawDomLinesCode = this.extractFromMonacoLines(doc);
    const domLinesCode = normalizeCode(rawDomLinesCode);
    if (this.validateCode(domLinesCode)) {
      const lineCount = domLinesCode ? domLinesCode.split('\n').length : 0;
      logger.info(
        `[SolutionExtractor] Strategy 2 (Monaco Editor DOM Lines) SUCCEEDED: rawLength=${rawDomLinesCode?.length || 0}, normalizedLength=${domLinesCode?.length || 0}, lines=${lineCount}`,
      );
      return domLinesCode;
    }

    // Strategy 3: Textarea / Input Elements
    logger.info('[SolutionExtractor] Attempting Strategy 3: Textarea Input');
    const rawTextareaCode = this.extractFromTextarea(doc);
    const textareaCode = normalizeCode(rawTextareaCode);
    if (this.validateCode(textareaCode)) {
      const lineCount = textareaCode ? textareaCode.split('\n').length : 0;
      logger.info(
        `[SolutionExtractor] Strategy 3 (Textarea Input) SUCCEEDED: rawLength=${rawTextareaCode?.length || 0}, normalizedLength=${textareaCode?.length || 0}, lines=${lineCount}`,
      );
      return textareaCode;
    }

    // Strategy 4: Semantic Code Elements (code, pre)
    logger.info('[SolutionExtractor] Attempting Strategy 4: Semantic Code Elements');
    const rawSemanticCode = this.extractFromSemanticCode(doc);
    const semanticCode = normalizeCode(rawSemanticCode);
    if (this.validateCode(semanticCode)) {
      const lineCount = semanticCode ? semanticCode.split('\n').length : 0;
      logger.info(
        `[SolutionExtractor] Strategy 4 (Semantic Code Elements) SUCCEEDED: rawLength=${rawSemanticCode?.length || 0}, normalizedLength=${semanticCode?.length || 0}, lines=${lineCount}`,
      );
      return semanticCode;
    }

    logger.warn('[SolutionExtractor] All extraction strategies failed to produce valid code.');
    return null;
  }

  /**
   * Strategy 1a: Communicates with page-world bridge running in "world": "MAIN"
   * to retrieve the complete Monaco editor text model without virtualization losses.
   */
  public async extractFromMonacoBridge(doc?: Document): Promise<string | null> {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    // 1. Request live extraction via CustomEvent / window.postMessage first
    // This queries the current Monaco Editor text model live to ensure new solutions replace old ones
    if (typeof CustomEvent === 'function' && typeof documentObj.dispatchEvent === 'function') {
      try {
        const requestId = `extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const codePromise = new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => {
            cleanup();
            resolve(null);
          }, 350);

          const eventListener = (e: Event) => {
            const ce = e as CustomEvent<{
              requestId?: string;
              success?: boolean;
              code?: string | null;
            }>;
            if (ce.detail && ce.detail.requestId === requestId) {
              cleanup();
              resolve(ce.detail.code || null);
            }
          };

          const messageListener = (event: MessageEvent) => {
            if (
              event.data &&
              event.data.type === 'LEETARCHIVE_MONACO_RESPONSE' &&
              event.data.requestId === requestId
            ) {
              cleanup();
              resolve(event.data.code || null);
            }
          };

          const cleanup = () => {
            clearTimeout(timer);
            documentObj.removeEventListener('LEETARCHIVE_MONACO_RESPONSE', eventListener);
            if (typeof window !== 'undefined') {
              window.removeEventListener('message', messageListener);
            }
          };

          documentObj.addEventListener('LEETARCHIVE_MONACO_RESPONSE', eventListener);
          if (typeof window !== 'undefined') {
            window.addEventListener('message', messageListener);
          }

          documentObj.dispatchEvent(
            new CustomEvent('LEETARCHIVE_MONACO_REQUEST', {
              detail: { requestId },
            }),
          );
        });

        const code = await codePromise;
        if (code) return code;
      } catch (err: unknown) {
        logger.debug(
          `[SolutionExtractor] Monaco bridge request exception: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 2. Fallback: Check DOM cache element if live event bridge timed out or is unavailable
    try {
      const cacheEl = documentObj.getElementById('__leetarchive_monaco_cache__');
      if (cacheEl && cacheEl.textContent && cacheEl.textContent.trim()) {
        const cached = cacheEl.textContent;
        logger.info(
          `[SolutionExtractor] Found cached Monaco code in DOM bridge element fallback (length: ${cached.length})`,
        );
        return cached;
      }
    } catch {
      // Ignore DOM access error
    }

    return null;
  }

  /**
   * Strategy 1b: Extracts code directly from Monaco Editor global instance models in the same realm.
   */
  public extractFromMonacoApi(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const monacoGlobal = (
        window as unknown as {
          monaco?: {
            editor?: {
              getModels: () => Array<{
                getValue: () => string;
                getLanguageId?: () => string;
                uri?: { toString: () => string };
              }>;
            };
          };
        }
      ).monaco;

      if (
        monacoGlobal &&
        monacoGlobal.editor &&
        typeof monacoGlobal.editor.getModels === 'function'
      ) {
        const models = monacoGlobal.editor.getModels();
        if (models && models.length > 0) {
          // Select model
          let selected = models[0];
          const codeModels = models.filter((m) => {
            const lang = typeof m.getLanguageId === 'function' ? m.getLanguageId() : '';
            return lang && lang !== 'plaintext' && lang !== 'markdown' && lang !== 'json';
          });
          if (codeModels.length > 0) {
            selected = codeModels[0];
          }
          const value = selected.getValue();
          return value || null;
        }
      }
    } catch (err: unknown) {
      logger.debug(
        `[SolutionExtractor] Monaco API access threw an exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }

  /**
   * Strategy 2: Extracts code from Monaco editor .view-line DOM nodes.
   * If the editor is virtualized (scrolled or partial DOM), this strategy strictly returns null
   * to protect data integrity and prevent partial solution archiving.
   */
  public extractFromMonacoLines(doc?: Document): string | null {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    const lineElements = documentObj.querySelectorAll(
      '.monaco-editor .view-line, [role="code"] .view-line, .view-line',
    );
    if (!lineElements || lineElements.length === 0) return null;

    // Safety check: Detect if editor DOM is virtualized
    if (this.isMonacoVirtualized(documentObj)) {
      logger.warn(
        `[SolutionExtractor] Monaco editor DOM is virtualized (${lineElements.length} rendered lines). Rejecting partial DOM extraction to ensure complete source archive.`,
      );
      return null;
    }

    const lines: string[] = [];
    for (const el of Array.from(lineElements)) {
      if (el && typeof el.cloneNode === 'function') {
        const clone = el.cloneNode(true) as Element;
        const decorative = clone.querySelectorAll('.line-numbers, [aria-hidden="true"]');
        decorative.forEach((node) => node.remove());
        lines.push(clone.textContent || '');
      } else {
        lines.push(el.textContent || '');
      }
    }

    const code = lines.join('\n');
    return code || null;
  }

  /**
   * Detects whether Monaco Editor's rendered .view-line elements represent only a partial
   * virtualized viewport slice instead of the full document.
   */
  public isMonacoVirtualized(documentObj: Document): boolean {
    try {
      // 1. Check line numbers: If the first line number rendered is not '1', editor is scrolled
      const lineNumbers = documentObj.querySelectorAll(
        '.monaco-editor .line-numbers, .monaco-editor .margin-view-overlays .line-numbers',
      );
      if (lineNumbers.length > 0) {
        const firstNumText = lineNumbers[0].textContent?.trim();
        if (firstNumText && firstNumText !== '1' && !isNaN(Number(firstNumText))) {
          return true;
        }
      }

      // 2. Check for active/visible vertical scrollbar or partial slider
      const verticalScrollbar = documentObj.querySelector(
        '.monaco-editor .scrollbar.vertical, .monaco-editor .visible.scrollbar.vertical',
      );
      if (verticalScrollbar) {
        if (verticalScrollbar.classList.contains('visible')) {
          return true;
        }
        const slider = verticalScrollbar.querySelector('.slider') as HTMLElement | null;
        const bar = verticalScrollbar as HTMLElement;
        if (slider && bar) {
          const sliderH = slider.offsetHeight || parseInt(slider.style.height || '0', 10);
          const barH = bar.offsetHeight || parseInt(bar.style.height || '0', 10);
          if (barH > 0 && sliderH > 0 && sliderH < barH - 5) {
            return true;
          }
        }
      }

      // 3. Check scrollHeight vs clientHeight of scrollable container
      const scrollable = documentObj.querySelector(
        '.monaco-editor .monaco-scrollable-element',
      ) as HTMLElement | null;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 20) {
        return true;
      }
    } catch {
      // If error occurs while inspecting virtualization, proceed with caution
    }

    return false;
  }

  /**
   * Strategy 3: Extracts code from textarea or textbox elements.
   */
  public extractFromTextarea(doc?: Document): string | null {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    const textareas = documentObj.querySelectorAll(
      'textarea.inputarea, textarea[role="textbox"], [role="textbox"], textarea',
    );
    for (const el of Array.from(textareas)) {
      const textarea = el as HTMLTextAreaElement;
      const value = textarea.value || textarea.textContent;
      if (value && value.trim()) {
        return value;
      }
    }

    return null;
  }

  /**
   * Strategy 4: Extracts code from semantic code or pre elements.
   */
  public extractFromSemanticCode(doc?: Document): string | null {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    const codeElements = documentObj.querySelectorAll('code, pre, [role="code"]');
    for (const el of Array.from(codeElements)) {
      const text = el.textContent;
      if (text && text.trim()) {
        return text;
      }
    }

    return null;
  }

  /**
   * Validates extracted code, rejecting null, empty, whitespace-only, or default placeholder content.
   */
  public validateCode(code: string | null): boolean {
    if (!code) return false;
    const trimmed = code.trim();
    if (!trimmed) return false;

    // Reject known default placeholder code strings
    if (trimmed.includes('Placeholder LeetCode Solution')) return false;

    return true;
  }

  /**
   * Stops listening for events and cleans up subscriptions.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isListening = false;
    logger.debug('[SolutionExtractor] Stopped solution extractor listener.');
  }
}
