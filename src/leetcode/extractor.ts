import { EventBus, SolutionExtractedPayload, SubmissionDetectedPayload } from '../core/events';
import { logger } from '../utils/logger';

/**
 * Service responsible solely for extracting solution source code from LeetCode problem pages
 * using a layered extraction pipeline (Monaco API -> Monaco DOM lines -> Textarea -> Semantic Code).
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
        this.handleSubmissionDetected(event.payload);
      },
    );
  }

  /**
   * Handles incoming SubmissionDetected events and publishes SolutionExtracted upon successful code retrieval.
   */
  public handleSubmissionDetected(payload: SubmissionDetectedPayload, doc?: Document): void {
    logger.debug(
      `[SolutionExtractor] Received SubmissionDetected event for problem '${payload.problemSlug}'`,
    );

    const code = this.extractSolutionCode(doc);
    if (!code) {
      logger.warn(
        `[SolutionExtractor] Failed to extract valid solution code for problem '${payload.problemSlug}'`,
      );
      return;
    }

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
   * Attempts to extract solution code using a 4-stage layered strategy.
   */
  public extractSolutionCode(doc?: Document): string | null {
    // Strategy 1: Monaco Editor Global API
    logger.debug('[SolutionExtractor] Attempting Strategy 1: Monaco Global API');
    const monacoCode = this.extractFromMonacoApi();
    if (this.validateCode(monacoCode)) {
      logger.debug('[SolutionExtractor] Strategy 1 (Monaco Global API) succeeded.');
      return monacoCode;
    }

    // Strategy 2: Monaco Editor DOM Lines (.view-line)
    logger.debug('[SolutionExtractor] Attempting Strategy 2: Monaco Editor DOM Lines');
    const domLinesCode = this.extractFromMonacoLines(doc);
    if (this.validateCode(domLinesCode)) {
      logger.debug('[SolutionExtractor] Strategy 2 (Monaco Editor DOM Lines) succeeded.');
      return domLinesCode;
    }

    // Strategy 3: Textarea / Input Elements
    logger.debug('[SolutionExtractor] Attempting Strategy 3: Textarea Input');
    const textareaCode = this.extractFromTextarea(doc);
    if (this.validateCode(textareaCode)) {
      logger.debug('[SolutionExtractor] Strategy 3 (Textarea Input) succeeded.');
      return textareaCode;
    }

    // Strategy 4: Semantic Code Elements (code, pre)
    logger.debug('[SolutionExtractor] Attempting Strategy 4: Semantic Code Elements');
    const semanticCode = this.extractFromSemanticCode(doc);
    if (this.validateCode(semanticCode)) {
      logger.debug('[SolutionExtractor] Strategy 4 (Semantic Code Elements) succeeded.');
      return semanticCode;
    }

    logger.debug('[SolutionExtractor] All extraction strategies failed to produce valid code.');
    return null;
  }

  /**
   * Strategy 1: Extracts code directly from Monaco Editor global instance models.
   */
  private extractFromMonacoApi(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const monacoGlobal = (
        window as unknown as {
          monaco?: { editor?: { getModels: () => Array<{ getValue: () => string }> } };
        }
      ).monaco;
      if (
        monacoGlobal &&
        monacoGlobal.editor &&
        typeof monacoGlobal.editor.getModels === 'function'
      ) {
        const models = monacoGlobal.editor.getModels();
        if (models && models.length > 0) {
          const value = models[0].getValue();
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
   * Strategy 2: Extracts code by querying Monaco editor .view-line DOM nodes.
   */
  private extractFromMonacoLines(doc?: Document): string | null {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    const lineElements = documentObj.querySelectorAll(
      '.monaco-editor .view-line, [role="code"] .view-line, .view-line',
    );
    if (!lineElements || lineElements.length === 0) return null;

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
   * Strategy 3: Extracts code from textarea or textbox elements.
   */
  private extractFromTextarea(doc?: Document): string | null {
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
  private extractFromSemanticCode(doc?: Document): string | null {
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
