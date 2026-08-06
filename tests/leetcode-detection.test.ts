import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LeetCodeParser } from '../src/leetcode/parser';
import { LeetCodeObserver } from '../src/leetcode/observer';
import { EventBus, SubmissionDetectedPayload } from '../src/core/events';

// Global mocks for Node vitest environment
class MockMutationObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn();
}

if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: {
      href: 'https://leetcode.com/problems/two-sum/',
      pathname: '/problems/two-sum/',
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis;
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    body: { appendChild: vi.fn() },
    title: '1. Two Sum - LeetCode',
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Document;
}

function createMockDocument(title: string = '') {
  const elements: Array<{
    tagName: string;
    id?: string;
    className: string;
    textContent: string;
    attributes: Record<string, string>;
  }> = [];

  return {
    title,
    body: {
      appendChild: (child: unknown) => {
        if (child && typeof child === 'object') {
          elements.push(child as (typeof elements)[0]);
        }
      },
    },
    createElement: (tag: string) => {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        attributes: {} as Record<string, string>,
        setAttribute: (key: string, val: string) => {
          el.attributes[key] = val;
        },
        getAttribute: (key: string) => el.attributes[key] || null,
      };
      return el;
    },
    querySelector: (selector: string) => {
      for (const el of elements) {
        if (
          selector.includes('data-e2e-locator') &&
          el.attributes['data-e2e-locator'] === 'submission-result'
        ) {
          return el;
        }
        if (el.className && selector.includes(el.className)) {
          return el;
        }
        if (
          selector.includes('headlessui-listbox-button') &&
          el.id &&
          el.id.includes('headlessui-listbox-button')
        ) {
          return el;
        }
        if (selector.includes('h4') && el.tagName === 'H4') {
          return el;
        }
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const matched = [];
      for (const el of elements) {
        if (
          selector.includes('text-sd-success') &&
          (el.className.includes('text-sd-success') || el.textContent === 'Accepted')
        ) {
          matched.push(el);
        }
      }
      return matched;
    },
  } as unknown as Document;
}

describe('LeetCodeParser', () => {
  it('extracts problem slug accurately from URL or pathname', () => {
    expect(LeetCodeParser.extractProblemSlug('/problems/two-sum/submissions/')).toBe('two-sum');
    expect(
      LeetCodeParser.extractProblemSlug(
        'https://leetcode.com/problems/add-two-numbers/description/',
      ),
    ).toBe('add-two-numbers');
    expect(LeetCodeParser.extractProblemSlug('/invalid/path/')).toBe('');
  });

  it('formats slug into human-readable title fallback', () => {
    expect(LeetCodeParser.formatSlugToTitle('two-sum')).toBe('Two Sum');
    expect(LeetCodeParser.formatSlugToTitle('3sum')).toBe('3Sum');
    expect(LeetCodeParser.formatSlugToTitle('longest-substring-without-repeating-characters')).toBe(
      'Longest Substring Without Repeating Characters',
    );
  });

  it('extracts problem title from DOM or document.title', () => {
    const mockDoc = createMockDocument('1. Two Sum - LeetCode');
    const headerEl = mockDoc.createElement('h4');
    headerEl.textContent = '1. Two Sum';
    mockDoc.body.appendChild(headerEl);

    expect(LeetCodeParser.extractProblemTitle(mockDoc)).toBe('Two Sum');
  });

  it('extracts difficulty from DOM badges', () => {
    const mockDoc = createMockDocument();
    const diffSpan = mockDoc.createElement('span');
    diffSpan.className = 'text-difficulty-medium';
    diffSpan.textContent = 'Medium';
    mockDoc.body.appendChild(diffSpan);

    expect(LeetCodeParser.extractProblemDifficulty(mockDoc)).toBe('Medium');
  });

  it('extracts language from editor header selector', () => {
    const mockDoc = createMockDocument();
    const langBtn = mockDoc.createElement('button');
    langBtn.id = 'headlessui-listbox-button-1';
    langBtn.textContent = 'Python3';
    mockDoc.body.appendChild(langBtn);

    expect(LeetCodeParser.extractLanguage(mockDoc)).toBe('python3');
  });

  it('defaults difficulty and language to Unknown when not found in DOM', () => {
    const emptyDoc = createMockDocument();
    expect(LeetCodeParser.extractProblemDifficulty(emptyDoc)).toBe('Unknown');
    expect(LeetCodeParser.extractLanguage(emptyDoc)).toBe('Unknown');
  });

  it('detects Accepted submission status from DOM elements', () => {
    const mockDoc = createMockDocument();
    const resultDiv = mockDoc.createElement('div');
    resultDiv.setAttribute('data-e2e-locator', 'submission-result');
    resultDiv.setAttribute('data-submission-id', '12345678');
    resultDiv.textContent = 'Accepted';
    mockDoc.body.appendChild(resultDiv);

    const detected = LeetCodeParser.detectAcceptedSubmission(mockDoc);
    expect(detected.isAccepted).toBe(true);
    expect(detected.submissionId).toBe('12345678');
  });
});

describe('LeetCodeObserver & Event System', () => {
  let observer: LeetCodeObserver;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    observer = new LeetCodeObserver();
  });

  afterEach(() => {
    observer.stop();
    eventBus.clearAllListeners();
    vi.restoreAllMocks();
  });

  it('emits SubmissionDetected event via EventBus when Accepted submission appears', () => {
    let emittedPayload: SubmissionDetectedPayload | null = null;
    eventBus.subscribe<SubmissionDetectedPayload>('SubmissionDetected', (event) => {
      emittedPayload = event.payload;
    });

    vi.spyOn(LeetCodeParser, 'detectAcceptedSubmission').mockReturnValue({ isAccepted: true });
    vi.spyOn(LeetCodeParser, 'extractProblemSlug').mockReturnValue('two-sum');
    vi.spyOn(LeetCodeParser, 'extractSubmissionMetadata').mockReturnValue({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      submissionId: '99887766',
    });

    observer.checkSubmissionResult();

    expect(emittedPayload).not.toBeNull();
    const payload = emittedPayload as unknown as SubmissionDetectedPayload;
    expect(payload.problemSlug).toBe('two-sum');
    expect(payload.problemTitle).toBe('Two Sum');
    expect(payload.language).toBe('python3');
    expect(payload.submissionId).toBe('99887766');
  });

  it('prevents duplicate SubmissionDetected events for the same accepted submission until reset', () => {
    let callCount = 0;
    eventBus.subscribe('SubmissionDetected', () => {
      callCount++;
    });

    const detectSpy = vi
      .spyOn(LeetCodeParser, 'detectAcceptedSubmission')
      .mockReturnValue({ isAccepted: true });
    vi.spyOn(LeetCodeParser, 'extractSubmissionMetadata').mockReturnValue({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      submissionId: '99887766',
    });

    // Trigger multiple times while in Accepted state -> should emit only once
    observer.checkSubmissionResult();
    observer.checkSubmissionResult();
    observer.checkSubmissionResult();
    expect(callCount).toBe(1);

    // Simulate DOM transitioning out of Accepted state (user submits code again)
    detectSpy.mockReturnValue({ isAccepted: false });
    observer.checkSubmissionResult();

    // DOM transitions back to Accepted state for new submission
    detectSpy.mockReturnValue({ isAccepted: true });
    observer.checkSubmissionResult();
    expect(callCount).toBe(2);
  });

  it('handles observer start and stop teardown cleanly', () => {
    expect(() => {
      observer.start();
      observer.stop();
    }).not.toThrow();
  });
});
