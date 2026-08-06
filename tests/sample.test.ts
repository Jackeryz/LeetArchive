import { describe, expect, it } from 'vitest';
import { formatProblemFolderName, getFileExtension, slugify } from '../src/utils/helpers';
import { EventBus } from '../src/core/events';
import { SecurityValidation } from '../src/security/validation';
import { TokenSecurity } from '../src/security/token';
import { APP_CONFIG } from '../src/core/config';

describe('LeetArchive Configuration & Branding', () => {
  it('APP_CONFIG name is LeetArchive', () => {
    expect(APP_CONFIG.name).toBe('LeetArchive');
    expect(APP_CONFIG.githubPatUrl).toBe('https://github.com/settings/tokens?type=beta');
  });

  it('slugify converts titles correctly', () => {
    expect(slugify('Two Sum')).toBe('two-sum');
    expect(slugify('  Add Two Numbers!  ')).toBe('add-two-numbers');
  });

  it('getFileExtension maps languages', () => {
    expect(getFileExtension('Python3')).toBe('py');
  });

  it('formatProblemFolderName pads problem id', () => {
    expect(formatProblemFolderName('1', 'Two Sum')).toBe('0001-two-sum');
  });
});

describe('Module 1 Security & Token Validation', () => {
  it('TokenSecurity classifies Fine-Grained PATs', () => {
    expect(TokenSecurity.classifyToken('github_pat_11AAAAAAA_1234567890')).toBe('FineGrainedPAT');
    expect(TokenSecurity.classifyToken('ghp_abcdef1234567890')).toBe('ClassicPAT');
    expect(TokenSecurity.classifyToken('ghs_abcdef1234567890')).toBe('GitHubAppToken');
    expect(TokenSecurity.classifyToken('invalid_token')).toBe('Unknown');
  });

  it('TokenSecurity masks tokens securely', () => {
    expect(TokenSecurity.maskToken('github_pat_11AAAAAAA_1234567890')).toBe('github_...7890');
    expect(TokenSecurity.maskToken('short')).toBe('****');
  });

  it('SecurityValidation prevents directory traversal', () => {
    expect(SecurityValidation.sanitizeFilePath('../../etc/passwd')).toBe('etc/passwd');
  });

  it('SecurityValidation checks repository owner/repo format', () => {
    expect(SecurityValidation.isValidRepoFormat('octocat/Hello-World')).toBe(true);
    expect(SecurityValidation.isValidRepoFormat('invalid-repo')).toBe(false);
  });
});

describe('Event Bus', () => {
  it('EventBus publishes and subscribes correctly', () => {
    const eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    let received = '';

    const unsub = eventBus.subscribe<{ problemSlug: string }>('SubmissionDetected', (ev) => {
      received = ev.payload.problemSlug;
    });

    eventBus.publish('SubmissionDetected', { problemSlug: 'two-sum' });
    expect(received).toBe('two-sum');
    unsub();
  });

  it('EventBus isolates listener exceptions so other handlers execute', () => {
    const eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    let secondHandlerExecuted = false;

    eventBus.subscribe('SyncRequested', () => {
      throw new Error('Failing listener');
    });

    eventBus.subscribe('SyncRequested', () => {
      secondHandlerExecuted = true;
    });

    expect(() => {
      eventBus.publish('SyncRequested', {});
    }).not.toThrow();

    expect(secondHandlerExecuted).toBe(true);
    eventBus.clearAllListeners();
  });
});
