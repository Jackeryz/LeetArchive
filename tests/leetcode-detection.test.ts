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
  const elements: any[] = [];

  function createElementNode(tag: string) {
    const children: any[] = [];
    const attributes: Record<string, string> = {};
    const el: any = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      attributes,
      children,
      setAttribute: (key: string, val: string) => {
        attributes[key] = val;
      },
      getAttribute: (key: string) => attributes[key] || null,
      hasAttribute: (key: string) => key in attributes,
      appendChild: (child: any) => {
        children.push(child);
        return child;
      },
      remove: () => {},
      cloneNode: (deep = true) => {
        const cloned = createElementNode(tag);
        cloned.id = el.id;
        cloned.className = el.className;
        cloned.textContent = el.textContent;
        cloned.attributes = { ...attributes };
        if (deep) {
          children.forEach((c) => {
            if (c.cloneNode) {
              const childClone = c.cloneNode(true);
              childClone.parentNode = cloned;
              cloned.children.push(childClone);
            }
          });
        }
        return cloned;
      },
      querySelectorAll: (selector: string) => {
        const matches: any[] = [];
        function search(nodes: any[]) {
          for (const node of nodes) {
            const nodeTag = node.tagName ? node.tagName.toLowerCase() : '';
            if (selector.includes(nodeTag) && nodeTag !== '') {
              matches.push(node);
            } else if (
              selector.includes('[aria-hidden="true"]') &&
              node.attributes['aria-hidden'] === 'true'
            ) {
              matches.push(node);
            }
            if (node.children && node.children.length > 0) {
              search(node.children);
            }
          }
        }
        search(children);
        return matches;
      },
    };
    return el;
  }

  function matchesSelector(el: any, selector: string): boolean {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    const attrs = el.attributes || {};

    if (
      selector.includes('data-e2e-locator') &&
      attrs['data-e2e-locator'] === 'submission-result'
    ) {
      return true;
    }
    if (
      selector.includes('button[aria-haspopup]') &&
      tag === 'button' &&
      'aria-haspopup' in attrs
    ) {
      return true;
    }
    if (
      selector.includes('[role="button"][aria-haspopup]') &&
      attrs['role'] === 'button' &&
      'aria-haspopup' in attrs
    ) {
      return true;
    }
    if (selector.includes('[role="combobox"]') && attrs['role'] === 'combobox') {
      return true;
    }
    if (selector === 'button, [role="button"]' || selector.includes('button, [role="button"]')) {
      if (tag === 'button' || attrs['role'] === 'button') return true;
    }
    if (
      selector.includes('[role="option"][aria-selected="true"]') &&
      attrs['role'] === 'option' &&
      attrs['aria-selected'] === 'true'
    ) {
      return true;
    }
    if (
      selector.includes('text-sd-success') &&
      (el.className.includes('text-sd-success') || el.textContent === 'Accepted')
    ) {
      return true;
    }
    if (el.className && selector.includes(el.className)) {
      return true;
    }
    if (selector.includes('h4') && tag === 'h4') {
      return true;
    }
    return false;
  }

  return {
    title,
    body: {
      appendChild: (child: unknown) => {
        if (child && typeof child === 'object') {
          elements.push(child as any);
        }
      },
    },
    createElement: (tag: string) => createElementNode(tag),
    querySelector: (selector: string) => {
      for (const el of elements) {
        if (matchesSelector(el, selector)) return el;
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const matched: any[] = [];
      for (const el of elements) {
        if (matchesSelector(el, selector)) matched.push(el);
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

  it('extracts language for multiple canonical languages via semantic ARIA buttons', () => {
    const languagesToTest = [
      { input: 'Python3', expected: 'python3' },
      { input: 'C++', expected: 'cpp' },
      { input: 'Java', expected: 'java' },
      { input: 'JavaScript', expected: 'javascript' },
      { input: 'TypeScript', expected: 'typescript' },
      { input: 'Go', expected: 'go' },
      { input: 'Rust', expected: 'rust' },
    ];

    for (const { input, expected } of languagesToTest) {
      const mockDoc = createMockDocument();
      const langBtn = mockDoc.createElement('button');
      langBtn.setAttribute('aria-haspopup', 'dialog');
      langBtn.textContent = input;
      mockDoc.body.appendChild(langBtn);

      expect(LeetCodeParser.extractLanguage(mockDoc)).toBe(expected);
    }
  });

  it('extracts language ignoring nested SVG icons and decorative elements', () => {
    const mockDoc = createMockDocument();
    const langBtn = mockDoc.createElement('button');
    langBtn.setAttribute('aria-haspopup', 'listbox');

    const svgIcon = mockDoc.createElement('svg');
    svgIcon.textContent = 'DecorativeIcon';
    langBtn.appendChild(svgIcon);

    const textSpan = mockDoc.createElement('span');
    textSpan.textContent = 'Python3';
    langBtn.appendChild(textSpan);

    langBtn.textContent = 'Python3';

    mockDoc.body.appendChild(langBtn);

    expect(LeetCodeParser.extractLanguage(mockDoc)).toBe('python3');
  });

  it('correctly selects language when multiple dialog buttons exist on page', () => {
    const mockDoc = createMockDocument();

    const settingsBtn = mockDoc.createElement('button');
    settingsBtn.setAttribute('aria-haspopup', 'dialog');
    settingsBtn.textContent = 'Settings';
    mockDoc.body.appendChild(settingsBtn);

    const langBtn = mockDoc.createElement('button');
    langBtn.setAttribute('aria-haspopup', 'dialog');
    langBtn.textContent = 'C++';
    mockDoc.body.appendChild(langBtn);

    expect(LeetCodeParser.extractLanguage(mockDoc)).toBe('cpp');
  });

  it('defaults difficulty and language to Unknown when not found in DOM or invalid', () => {
    const mockDoc = createMockDocument();
    const invalidBtn = mockDoc.createElement('button');
    invalidBtn.setAttribute('aria-haspopup', 'dialog');
    invalidBtn.textContent = 'NonExistentLanguage';
    mockDoc.body.appendChild(invalidBtn);

    expect(LeetCodeParser.extractProblemDifficulty(mockDoc)).toBe('Unknown');
    expect(LeetCodeParser.extractLanguage(mockDoc)).toBe('Unknown');
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

  it('Requirement C: emits new SubmissionDetected when submissionId changes even if DOM remained in Accepted state', () => {
    let callCount = 0;
    const emittedSubmissions: string[] = [];
    eventBus.subscribe<SubmissionDetectedPayload>('SubmissionDetected', (e) => {
      callCount++;
      if (e.payload.submissionId) emittedSubmissions.push(e.payload.submissionId);
    });

    let currentSubId: string | undefined = 'sub_111';

    vi.spyOn(LeetCodeParser, 'detectAcceptedSubmission').mockImplementation(() => ({
      isAccepted: true,
      submissionId: currentSubId,
    }));

    vi.spyOn(LeetCodeParser, 'extractSubmissionMetadata').mockImplementation(() => ({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: Date.now(),
      submissionId: currentSubId,
    }));

    // First submission
    observer.checkSubmissionResult();
    expect(callCount).toBe(1);

    // Same submission repeated while in Accepted state -> deduplicated
    observer.checkSubmissionResult();
    expect(callCount).toBe(1);

    // Second submission arrives with NEW submissionId without DOM leaving Accepted state
    currentSubId = 'sub_222';
    observer.checkSubmissionResult();

    // Must emit for second submission!
    expect(callCount).toBe(2);
    expect(emittedSubmissions).toEqual(['sub_111', 'sub_222']);
  });

  it('allows second submission for same problem when resetSubmissionLock is triggered', () => {
    let callCount = 0;
    eventBus.subscribe('SubmissionDetected', () => {
      callCount++;
    });

    vi.spyOn(LeetCodeParser, 'detectAcceptedSubmission').mockReturnValue({ isAccepted: true });
    vi.spyOn(LeetCodeParser, 'extractSubmissionMetadata').mockReturnValue({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: Date.now(),
    });

    observer.checkSubmissionResult();
    expect(callCount).toBe(1);

    // Resets lock (simulating user clicking Submit or pressing shortcut)
    observer.resetSubmissionLock();

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
