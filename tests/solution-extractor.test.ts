import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SolutionExtractor } from '../src/leetcode/extractor';
import { EventBus, SolutionExtractedPayload, SubmissionDetectedPayload } from '../src/core/events';

// Global mocks for Node environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {} as unknown as Window & typeof globalThis;
}

function createMockDocument(elementsList: any[] = []) {
  return {
    querySelectorAll: (selector: string) => {
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
  } as unknown as Document;
}

describe('SolutionExtractor', () => {
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

  it('extracts code via Strategy 1 (Monaco Global API)', () => {
    const expectedCode = 'class Solution:\n    def twoSum(self, nums, target):\n        return []';
    (globalThis.window as any).monaco = {
      editor: {
        getModels: () => [
          {
            getValue: () => expectedCode,
          },
        ],
      },
    };

    const code = extractor.extractSolutionCode();
    expect(code).toBe(expectedCode);
  });

  it('extracts code via Strategy 2 (Monaco Editor DOM Lines)', () => {
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

    const mockDoc = createMockDocument(mockLines);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('function twoSum(nums, target) {\n    return [0, 1];\n}');
  });

  it('extracts code via Strategy 3 (Textarea Input Fallback)', () => {
    const mockTextarea = {
      tagName: 'TEXTAREA',
      className: 'inputarea',
      value: 'public class Solution { public int[] twoSum() {} }',
    };

    const mockDoc = createMockDocument([mockTextarea]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('public class Solution { public int[] twoSum() {} }');
  });

  it('extracts code via Strategy 4 (Semantic Code / Pre Elements)', () => {
    const mockCodeEl = {
      tagName: 'PRE',
      className: '',
      textContent: 'fn main() { println!("Hello LeetCode"); }',
    };

    const mockDoc = createMockDocument([mockCodeEl]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('fn main() { println!("Hello LeetCode"); }');
  });

  it('rejects empty, whitespace-only, or placeholder code in validateCode', () => {
    expect(extractor.validateCode('')).toBe(false);
    expect(extractor.validateCode('   \n\t ')).toBe(false);
    expect(extractor.validateCode('// Placeholder LeetCode Solution\n')).toBe(false);
    expect(extractor.validateCode('valid code block')).toBe(true);
  });

  it('handles failed extraction gracefully when all strategies return invalid code', () => {
    const mockEmptyTextarea = {
      tagName: 'TEXTAREA',
      className: 'inputarea',
      value: '   ',
    };

    const mockDoc = createMockDocument([mockEmptyTextarea]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBeNull();
  });

  it('subscribes to SubmissionDetected and publishes SolutionExtracted event with accurate payload', () => {
    let emittedSolutionPayload: SolutionExtractedPayload | null = null;
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      emittedSolutionPayload = event.payload;
    });

    vi.spyOn(extractor, 'extractSolutionCode').mockReturnValue(
      'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass',
    );

    const submissionPayload: SubmissionDetectedPayload = {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      submissionId: '10001',
    };

    extractor.start();
    eventBus.publish('SubmissionDetected', submissionPayload);

    expect(emittedSolutionPayload).not.toBeNull();
    const result = emittedSolutionPayload as unknown as SolutionExtractedPayload;
    expect(result.problemTitle).toBe('Two Sum');
    expect(result.problemSlug).toBe('two-sum');
    expect(result.difficulty).toBe('Easy');
    expect(result.language).toBe('python3');
    expect(result.code).toContain('def twoSum');
  });

  it('handles multiple Accepted submissions across different languages', () => {
    const emittedEvents: SolutionExtractedPayload[] = [];
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      emittedEvents.push(event.payload);
    });

    extractor.start();

    const submissions: Array<{ slug: string; lang: string; code: string }> = [
      { slug: 'two-sum', lang: 'python3', code: 'def twoSum(): pass' },
      { slug: 'add-two-numbers', lang: 'cpp', code: 'int main() { return 0; }' },
      { slug: '3sum', lang: 'java', code: 'class Solution {}' },
    ];

    for (const sub of submissions) {
      vi.spyOn(extractor, 'extractSolutionCode').mockReturnValueOnce(sub.code);

      eventBus.publish('SubmissionDetected', {
        problemTitle: sub.slug,
        problemSlug: sub.slug,
        difficulty: 'Medium',
        language: sub.lang,
        timestamp: Date.now(),
      });
    }

    expect(emittedEvents.length).toBe(3);
    expect(emittedEvents[0].language).toBe('python3');
    expect(emittedEvents[1].language).toBe('cpp');
    expect(emittedEvents[2].language).toBe('java');
  });
});
