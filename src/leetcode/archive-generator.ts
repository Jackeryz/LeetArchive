import {
  ArchiveGeneratedPayload,
  ArchiveMode,
  EventBus,
  SolutionExtractedPayload,
  VirtualFile,
} from '../core/events';
import { getSolutionFilename } from '../utils/constants';
import { logger } from '../utils/logger';
import { generateReadme } from './readme';

/**
 * Service responsible for converting extracted LeetCode solutions into an in-memory virtual file archive representation.
 */
export class ArchiveGenerator {
  private unsubscribe: (() => void) | null = null;
  private isListening: boolean = false;
  private defaultArchiveMode: ArchiveMode = 'folder';

  /**
   * Starts listening for SolutionExtracted events on the EventBus.
   */
  start(mode: ArchiveMode = 'folder'): void {
    if (this.isListening) {
      logger.debug('[ArchiveGenerator] Already listening for SolutionExtracted events.');
      return;
    }

    this.defaultArchiveMode = mode;
    logger.debug(
      `[ArchiveGenerator] Starting archive generator listener (default mode: ${this.defaultArchiveMode})...`,
    );
    this.isListening = true;

    this.unsubscribe = EventBus.getInstance().subscribe<SolutionExtractedPayload>(
      'SolutionExtracted',
      (event) => {
        this.handleSolutionExtracted(event.payload);
      },
    );
  }

  /**
   * Handles incoming SolutionExtracted events and publishes ArchiveGenerated upon successful archive creation.
   */
  public handleSolutionExtracted(
    payload: SolutionExtractedPayload,
    overrideMode?: ArchiveMode,
  ): ArchiveGeneratedPayload | null {
    logger.debug(
      `[ArchiveGenerator] SolutionExtracted received for problem '${payload.problemSlug}'`,
    );

    const mode = overrideMode || this.defaultArchiveMode;
    const archive = this.generateArchive(payload, mode);

    if (!archive) {
      return null;
    }

    logger.debug(
      `[ArchiveGenerator] Publishing ArchiveGenerated event for problem '${payload.problemSlug}'`,
    );
    EventBus.getInstance().publish('ArchiveGenerated', archive);
    return archive;
  }

  /**
   * Generates an in-memory virtual file archive representation from solution metadata.
   */
  public generateArchive(
    payload: SolutionExtractedPayload,
    mode: ArchiveMode = 'folder',
  ): ArchiveGeneratedPayload | null {
    // Validation: Reject empty or whitespace-only solution code
    if (!payload.code || !payload.code.trim()) {
      logger.warn(
        `[ArchiveGenerator] Rejected archive generation: Solution code is empty or whitespace-only for '${payload.problemSlug}'`,
      );
      return null;
    }

    // Validation: Reject missing required metadata
    if (!payload.problemTitle || !payload.problemSlug || !payload.language) {
      logger.warn(
        `[ArchiveGenerator] Rejected archive generation: Required metadata missing for '${payload.problemSlug}'`,
      );
      return null;
    }

    const solutionFilename = getSolutionFilename(payload.language);
    logger.debug(`[ArchiveGenerator] Generating solution file: ${solutionFilename}`);

    const files: VirtualFile[] = [];

    if (mode === 'folder') {
      logger.debug('[ArchiveGenerator] Generating README...');
      const readmeContent = generateReadme({
        problemTitle: payload.problemTitle,
        problemSlug: payload.problemSlug,
        difficulty: payload.difficulty,
        language: payload.language,
        solutionFilename,
        timestamp: payload.timestamp,
      });

      files.push({
        path: `${payload.problemTitle}/README.md`,
        content: readmeContent,
      });

      files.push({
        path: `${payload.problemTitle}/${solutionFilename}`,
        content: payload.code,
      });
    } else {
      // Single-file mode: "Problem Title.<ext>"
      const extMatch = solutionFilename.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1] : 'txt';
      const singleFilePath = `${payload.problemTitle}.${ext}`;

      files.push({
        path: singleFilePath,
        content: payload.code,
      });
    }

    logger.debug(
      `[ArchiveGenerator] Archive generated successfully in '${mode}' mode with ${files.length} virtual files.`,
    );

    return {
      problemTitle: payload.problemTitle,
      problemSlug: payload.problemSlug,
      difficulty: payload.difficulty,
      language: payload.language,
      timestamp: payload.timestamp || Date.now(),
      archiveMode: mode,
      files,
    };
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
    logger.debug('[ArchiveGenerator] Stopped archive generator listener.');
  }
}
