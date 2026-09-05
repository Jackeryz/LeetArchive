import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SolutionExtractor, normalizeCode } from '../src/leetcode/extractor';
import { EventBus, SolutionExtractedPayload, SubmissionDetectedPayload } from '../src/core/events';

// Global mocks for Node environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {} as unknown as Window & typeof globalThis;
}

interface MockElement {
  tagName?: string;
  className?: string;
  id?: string;
  textContent?: string | null;
  value?: string;
  attributes?: Record<string, string>;
  classList?: { contains: (c: string) => boolean };
  children?: MockElement[];
  offsetHeight?: number;
  clientHeight?: number;
  scrollHeight?: number;
  style?: Record<string, string>;
  cloneNode?: (deep?: boolean) => MockElement;
  querySelectorAll?: (selector: string) => MockElement[];
  querySelector?: (selector: string) => MockElement | null;
}

function createMockDocument(
  elementsList: MockElement[] = [],
  domCacheText: string | null = null,
  isVirtualized: boolean = false,
) {
  const listeners: Record<string, Array<(e: Event) => void>> = {};

  return {
    getElementById: (id: string) => {
      if (id === '__leetarchive_monaco_cache__' && domCacheText !== null) {
        return {
          id: '__leetarchive_monaco_cache__',
          textContent: domCacheText,
        };
      }
      return null;
    },
    querySelector: (selector: string) => {
      if (selector.includes('.monaco-editor')) {
        return {
          className: 'monaco-editor',
          querySelector: (subSelector: string) => {
            if (isVirtualized && subSelector.includes('.scrollbar.vertical')) {
              return {
                className: 'scrollbar vertical visible',
                classList: { contains: (c: string) => c === 'visible' },
                querySelector: () => ({ offsetHeight: 20 }),
                offsetHeight: 200,
              };
            }
            return null;
          },
        };
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (isVirtualized && selector.includes('.line-numbers')) {
        // Virtualized editor scrolled down to line 25
        return [
          { textContent: '25' },
          { textContent: '26' },
          { textContent: '27' },
        ];
      }

      const matches: any[] = [];
      for (const el of elementsList) {
        const tag = (el.tagName || '').toLowerCase();
        const className = el.className || '';
        const role = el.attributes?.role || '';

        if (selector.includes('.view-line') && className.includes('view-line')) {
          matches.push(el);
        } else if (selector.includes('textarea') && tag === 'textarea') {
          matches.push(el);
        } else if (
          selector.includes('code') &&
          (tag === 'code' || tag === 'pre' || role === 'code')
        ) {
          matches.push(el);
        }
      }
      return matches;
    },
    addEventListener: (type: string, handler: (e: Event) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type: string, handler: (e: Event) => void) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    },
    dispatchEvent: (event: Event) => {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) {
        h(event);
      }
      return true;
    },
  } as unknown as Document;
}

describe('Code Normalization (normalizeCode)', () => {
  it('replaces Unicode non-breaking spaces (\\u00A0) with standard ASCII spaces', () => {
    const raw = 'def\u00A0twoSum(self,\u00A0nums):\n\u00A0\u00A0\u00A0\u00A0return []';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe('def twoSum(self, nums):\n    return []\n');
  });

  it('converts Windows CRLF (\\r\\n) to Unix LF (\\n)', () => {
    const raw =
      'class Solution {\r\n    public int[] twoSum() {\r\n        return new int[]{};\r\n    }\r\n}';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe(
      'class Solution {\n    public int[] twoSum() {\n        return new int[]{};\n    }\n}\n',
    );
  });

  it('removes trailing blank lines and guarantees a single trailing newline', () => {
    const raw = 'function test() {}\n\n\n   \n\t\n';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe('function test() {}\n');
  });

  it('preserves leading indentation and internal blank lines', () => {
    const raw =
      'class Solution:\n    def solve(self):\n\n        # Internal comment\n        return True\n';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe(
      'class Solution:\n    def solve(self):\n\n        # Internal comment\n        return True\n',
    );
  });

  it('returns null for empty or whitespace-only code strings', () => {
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode('   \r\n\t  \n')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
});

describe('SolutionExtractor \u2014 Complete Extraction & Virtualization Safeguards', () => {
  let extractor: SolutionExtractor;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    extractor = new SolutionExtractor();
  });

  afterEach(() => {
    extractor.stop();
    eventBus.clearAllListeners();
    delete (globalThis.window as any).monaco;
    vi.restoreAllMocks();
  });

  // Requirement 1: A short solution is extracted completely
  it('Requirement 1: extracts a short solution completely via Monaco API', async () => {
    const shortCode = 'def twoSum(nums, target):\n    return [0, 1]\n';
    (globalThis.window as any).monaco = {
      editor: {
        getModels: () => [{ getValue: () => shortCode, getLanguageId: () => 'python' }],
      },
    };

    const code = await extractor.extractSolutionCode();
    expect(code).toBe(shortCode);
  });

  // Requirement 2: A long multi-line solution is extracted completely
  it('Requirement 2: extracts a long multi-line solution completely without truncation', async () => {
    const lines = ['class Solution:'];
    for (let i = 1; i <= 150; i++) {
      lines.push(`    def helperStep${i}(self, value: int) -> int:`);
      lines.push(`        # Step ${i} calculation`);
      lines.push(`        return value + ${i}`);
    }
    lines.push('    def solve(self):');
    lines.push('        return self.helperStep150(42)');

    const fullLongSolution = lines.join('\n');
    expect(lines.length).toBeGreaterThan(450);

    (globalThis.window as any).monaco = {
      editor: {
        getModels: () => [
          {
            getValue: () => fullLongSolution,
            getLanguageId: () => 'python',
          },
        ],
      },
    };

    const extracted = await extractor.extractSolutionCode();
    expect(extracted).not.toBeNull();
    expect(extracted).toBe(`${fullLongSolution}\n`);
    expect(extracted?.split('\n').length).toBe(lines.length + 1);
    expect(extracted).toContain('def helperStep150');
    expect(extracted).toContain('return self.helperStep150(42)');
  });

  // Requirement 3: A virtualized/partial .view-line DOM does NOT get treated as the complete source
  it('Requirement 3: strictly rejects virtualized/partial .view-line DOM from being treated as complete source', async () => {
    // Simulate Monaco editor where editor is virtualized (scrolled, visible lines 25-27)
    const partialVisibleLines: MockElement[] = [
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '        # line 25 visible slice',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '        return result[0]',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
    ];

    // createMockDocument with isVirtualized = true (scrollbar visible, line-numbers start at 25)
    const mockDoc = createMockDocument(partialVisibleLines, null, true);

    // Verify isMonacoVirtualized returns true
    expect(extractor.isMonacoVirtualized(mockDoc)).toBe(true);

    // extractFromMonacoLines must return null when virtualized
    const linesResult = extractor.extractFromMonacoLines(mockDoc);
    expect(linesResult).toBeNull();

    // extractSolutionCode must NOT return the 2 partial lines
    const code = await extractor.extractSolutionCode(mockDoc);
    expect(code).toBeNull();
  });

  // Requirement 4: Monaco model extraction returns the complete source via bridge cache
  it('Requirement 4: extracts complete source via page-world bridge DOM cache', async () => {
    const completeSource = [
      '# Complete Solution',
      'class Solution {',
      '    public int lengthOfLongestSubstring(String s) {',
      '        int n = s.length();',
      '        int ans = 0;',
      '        int[] index = new int[128];',
      '        for (int j = 0, i = 0; j < n; j++) {',
      '            i = Math.max(index[s.charAt(j)], i);',
      '            ans = Math.max(ans, j - i + 1);',
      '            index[s.charAt(j)] = j + 1;',
      '        }',
      '        return ans;',
      '    }',
      '}',
    ].join('\n');

    // Simulate page bridge caching complete code in __leetarchive_monaco_cache__
    const mockDoc = createMockDocument([], completeSource, false);

    const extracted = await extractor.extractSolutionCode(mockDoc);
    expect(extracted).toBe(`${completeSource}\n`);
    expect(extracted).toContain('public int lengthOfLongestSubstring');
    expect(extracted).toContain('return ans;');
  });

  // Requirement 5: The final SolutionExtractedPayload.code exactly matches the complete source after normalization
  it('Requirement 5: SolutionExtractedPayload.code exactly matches complete source after normalization', async () => {
    let capturedPayload: SolutionExtractedPayload | null = null;
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      capturedPayload = event.payload;
    });

    const rawSolutionWithCrlfAndSpaces =
      'class Solution:\r\n\u00A0\u00A0\u00A0\u00A0def twoSum(self, nums: List[int], target: int) -> List[int]:\r\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0return [0, 1]\r\n\r\n';

    const expectedNormalized =
      'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        return [0, 1]\n';

    (globalThis.window as any).monaco = {
      editor: {
        getModels: () => [
          {
            getValue: () => rawSolutionWithCrlfAndSpaces,
            getLanguageId: () => 'python',
          },
        ],
      },
    };

    extractor.start();

    const submissionPayload: SubmissionDetectedPayload = {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      submissionId: '99999',
    };

    await extractor.handleSubmissionDetected(submissionPayload);

    expect(capturedPayload).not.toBeNull();
    const result = capturedPayload as unknown as SolutionExtractedPayload;
    expect(result.code).toBe(expectedNormalized);
    expect(result.problemTitle).toBe('Two Sum');
    expect(result.problemSlug).toBe('two-sum');
    expect(result.difficulty).toBe('Easy');
    expect(result.language).toBe('python3');
  });

  it('extracts non-virtualized small snippet via Strategy 2 (.view-line) when editor has no scrollbar', async () => {
    const mockLines = [
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: 'function twoSum(nums, target) {',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '    return [0, 1];',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '}',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
    ];

    // Non-virtualized doc (isVirtualized = false)
    const mockDoc = createMockDocument(mockLines, null, false);
    const code = await extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('function twoSum(nums, target) {\n    return [0, 1];\n}\n');
  });

  it('extracts code via Strategy 3 (Textarea Input Fallback)', async () => {
    const mockTextarea = {
      tagName: 'TEXTAREA',
      className: 'inputarea',
      value: 'public class Solution { public int[] twoSum() {} }',
    };

    const mockDoc = createMockDocument([mockTextarea]);
    const code = await extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('public class Solution { public int[] twoSum() {} }\n');
  });

  it('extracts code via Strategy 4 (Semantic Code / Pre Elements)', async () => {
    const mockCodeEl = {
      tagName: 'PRE',
      className: '',
      textContent: 'fn main() { println!("Hello LeetCode"); }',
    };

    const mockDoc = createMockDocument([mockCodeEl]);
    const code = await extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('fn main() { println!("Hello LeetCode"); }\n');
  });

  it('rejects empty, whitespace-only, or placeholder code in validateCode', () => {
    expect(extractor.validateCode('')).toBe(false);
    expect(extractor.validateCode('   \n\t ')).toBe(false);
    expect(extractor.validateCode('// Placeholder LeetCode Solution\n')).toBe(false);
    expect(extractor.validateCode('valid code block')).toBe(true);
  });

  it('handles multiple Accepted submissions across different languages', async () => {
    const emittedEvents: SolutionExtractedPayload[] = [];
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      emittedEvents.push(event.payload);
    });

    extractor.start();

    const submissions = [
      { slug: 'two-sum', lang: 'python3', code: 'def twoSum(): pass' },
      { slug: 'add-two-numbers', lang: 'cpp', code: 'int main() { return 0; }' },
      { slug: '3sum', lang: 'java', code: 'class Solution {}' },
    ];

    for (const sub of submissions) {
      vi.spyOn(extractor, 'extractSolutionCode').mockResolvedValueOnce(sub.code);

      eventBus.publish('SubmissionDetected', {
        problemTitle: sub.slug,
        problemSlug: sub.slug,
        difficulty: 'Medium',
        language: sub.lang,
        timestamp: Date.now(),
      });
    }

    // Wait microtask tick for async handlers
    await new Promise((r) => setTimeout(r, 10));

    expect(emittedEvents.length).toBe(3);
    expect(emittedEvents[0].language).toBe('python3');
    expect(emittedEvents[1].language).toBe('cpp');
    expect(emittedEvents[2].language).toBe('java');
  });
});
