import { ProblemDifficulty, SubmissionDetails } from '../types/leetcode';
import { logger } from '../utils/logger';

export type ExtensionEventType =
  | 'SubmissionDetected'
  | 'SolutionExtracted'
  | 'ArchiveGenerated'
  | 'SubmissionParsed'
  | 'SyncRequested'
  | 'SyncCompleted'
  | 'SyncFailed';

export interface ExtensionEvent<T = unknown> {
  type: ExtensionEventType;
  payload: T;
  timestamp: number;
}

export type EventCallback<T = unknown> = (event: ExtensionEvent<T>) => void;

/**
 * Decoupled event bus to facilitate event-driven communication between content script, observers, and background tasks.
 */
export class EventBus {
  private static instance: EventBus;
  private listeners: Map<ExtensionEventType, EventCallback[]> = new Map();

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public subscribe<T>(type: ExtensionEventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    const handlers = this.listeners.get(type)!;

    if (!handlers.includes(callback as EventCallback)) {
      handlers.push(callback as EventCallback);
    }

    return () => {
      const index = handlers.indexOf(callback as EventCallback);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }

  public publish<T>(type: ExtensionEventType, payload: T): void {
    const event: ExtensionEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    const handlers = [...(this.listeners.get(type) || [])];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err: unknown) {
        logger.error(
          `EventBus listener for '${type}' threw an exception: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  public clearAllListeners(): void {
    this.listeners.clear();
  }
}

export interface SubmissionDetectedPayload {
  problemTitle: string;
  problemSlug: string;
  difficulty: ProblemDifficulty;
  language: string;
  timestamp: number;
  submissionId?: string;
  url?: string;
  rawElementId?: string;
}

export interface SolutionExtractedPayload {
  problemTitle: string;
  problemSlug: string;
  difficulty: ProblemDifficulty;
  language: string;
  code: string;
  timestamp: number;
}

export type ArchiveMode = 'folder' | 'single-file';

export interface VirtualFile {
  path: string;
  content: string;
}

export interface ArchiveGeneratedPayload {
  problemTitle: string;
  problemSlug: string;
  difficulty: ProblemDifficulty;
  language: string;
  timestamp: number;
  archiveMode: ArchiveMode;
  files: VirtualFile[];
}

export interface SubmissionParsedPayload {
  submission: SubmissionDetails;
}
