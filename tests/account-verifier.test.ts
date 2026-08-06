import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LeetCodeAccountDetector } from '../src/leetcode/account-detector';
import { AccountVerifier } from '../src/leetcode/account-verifier';
import { SettingsStorage } from '../src/storage/settings';
import { AccountVerifiedPayload, ArchiveGeneratedPayload, EventBus } from '../src/core/events';

// Global mocks for Node environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {} as unknown as Window & typeof globalThis;
}

function createMockDocument(elementsList: any[] = []) {
  return {
    querySelector: (selector: string) => {
      for (const el of elementsList) {
        if (selector.includes('script#__NEXT_DATA__') && el.id === '__NEXT_DATA__') {
          return el;
        }
        if (selector.includes('meta') && el.tagName === 'META') {
          if (selector.includes(el.name) || selector.includes(el.property)) {
            return el;
          }
        }
      }
      return null;
    },
    querySelectorAll: (_selector: string) => {
      const matches: any[] = [];
      for (const el of elementsList) {
        const tag = (el.tagName || '').toLowerCase();
        const href = el.getAttribute ? el.getAttribute('href') || '' : el.href || '';
        if (tag === 'a' && href) {
          matches.push(el);
        }
      }
      return matches;
    },
  } as unknown as Document;
}

describe('LeetCodeAccountDetector', () => {
  afterEach(() => {
    delete (globalThis.window as any).__NEXT_DATA__;
    delete (globalThis.window as any).userStatus;
  });

  it('detects username via Strategy 1 (window.__NEXT_DATA__)', () => {
    (globalThis.window as any).__NEXT_DATA__ = {
      props: {
        pageProps: {
          userStatus: {
            isSignedIn: true,
            username: 'username_xyz',
          },
        },
      },
    };

    const username = LeetCodeAccountDetector.detectCurrentAccount();
    expect(username).toBe('username_xyz');
  });

  it('detects username via Strategy 1b (DOM script#__NEXT_DATA__ tag)', () => {
    const mockScript = {
      id: '__NEXT_DATA__',
      tagName: 'SCRIPT',
      textContent: JSON.stringify({
        props: {
          pageProps: {
            userStatus: {
              isSignedIn: true,
              username: 'script_user_123',
            },
          },
        },
      }),
    };

    const doc = createMockDocument([mockScript]);
    const username = LeetCodeAccountDetector.detectCurrentAccount(doc);
    expect(username).toBe('script_user_123');
  });

  it('detects username via Strategy 2 (Meta tags)', () => {
    const mockMeta = {
      tagName: 'META',
      name: 'username',
      getAttribute: (attr: string) => (attr === 'content' ? 'meta_user_456' : null),
    };

    const doc = createMockDocument([mockMeta]);
    const username = LeetCodeAccountDetector.detectCurrentAccount(doc);
    expect(username).toBe('meta_user_456');
  });

  it('detects username via Strategy 3 & 4 (Navigation/DOM links)', () => {
    const mockLink = {
      tagName: 'A',
      href: '/u/nav_user_789/',
      getAttribute: (attr: string) => (attr === 'href' ? '/u/nav_user_789/' : null),
    };

    const doc = createMockDocument([mockLink]);
    const username = LeetCodeAccountDetector.detectCurrentAccount(doc);
    expect(username).toBe('nav_user_789');
  });

  it('cleans and validates raw username strings, rejecting generic keywords', () => {
    expect(LeetCodeAccountDetector.cleanAndValidateUsername('  username_xyz  ')).toBe(
      'username_xyz',
    );
    expect(LeetCodeAccountDetector.cleanAndValidateUsername('login')).toBeNull();
    expect(LeetCodeAccountDetector.cleanAndValidateUsername('problems')).toBeNull();
    expect(LeetCodeAccountDetector.cleanAndValidateUsername('')).toBeNull();
    expect(LeetCodeAccountDetector.cleanAndValidateUsername('invalid username spaces')).toBeNull();
  });
});

describe('AccountVerifier', () => {
  let verifier: AccountVerifier;
  let eventBus: EventBus;

  const sampleArchivePayload: ArchiveGeneratedPayload = {
    problemTitle: 'Two Sum',
    problemSlug: 'two-sum',
    difficulty: 'Easy',
    language: 'python3',
    timestamp: 1700000000000,
    archiveMode: 'folder',
    files: [
      { path: 'Two Sum/README.md', content: '# Two Sum' },
      { path: 'Two Sum/solution.py', content: 'print("hello")' },
    ],
  };

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    verifier = new AccountVerifier();
  });

  afterEach(() => {
    verifier.stop();
    eventBus.clearAllListeners();
    delete (globalThis.window as any).__NEXT_DATA__;
    vi.restoreAllMocks();
  });

  it('verifies successfully and publishes AccountVerified when configured and detected usernames match (case-insensitive & trimmed)', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'pat_123',
      selectedRepo: 'user/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: '  Username_XYZ  ',
    });

    (globalThis.window as any).__NEXT_DATA__ = {
      props: {
        pageProps: {
          userStatus: {
            isSignedIn: true,
            username: 'username_xyz',
          },
        },
      },
    };

    let emittedEventPayload: AccountVerifiedPayload | null = null;
    eventBus.subscribe<AccountVerifiedPayload>('AccountVerified', (event) => {
      emittedEventPayload = event.payload;
    });

    verifier.start();
    const result = await verifier.verifyAndPublish(sampleArchivePayload);

    expect(result).not.toBeNull();
    expect(result?.username).toBe('username_xyz');
    expect(emittedEventPayload).not.toBeNull();
    expect((emittedEventPayload as unknown as AccountVerifiedPayload).archive.problemSlug).toBe(
      'two-sum',
    );
  });

  it('suppresses publication and logs warning when detected username does not match configured username', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'pat_123',
      selectedRepo: 'user/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: 'configured_user',
    });

    (globalThis.window as any).__NEXT_DATA__ = {
      props: {
        pageProps: {
          userStatus: {
            isSignedIn: true,
            username: 'alternate_account',
          },
        },
      },
    };

    let emittedEventPayload: AccountVerifiedPayload | null = null;
    eventBus.subscribe<AccountVerifiedPayload>('AccountVerified', (event) => {
      emittedEventPayload = event.payload;
    });

    const result = await verifier.verifyAndPublish(sampleArchivePayload);

    expect(result).toBeNull();
    expect(emittedEventPayload).toBeNull();
  });

  it('suppresses publication when no configured username exists in settings', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'pat_123',
      selectedRepo: 'user/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: null,
    });

    (globalThis.window as any).__NEXT_DATA__ = {
      props: {
        pageProps: {
          userStatus: {
            isSignedIn: true,
            username: 'username_xyz',
          },
        },
      },
    };

    const result = await verifier.verifyAndPublish(sampleArchivePayload);
    expect(result).toBeNull();
  });

  it('suppresses publication when current logged-in username cannot be detected', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'pat_123',
      selectedRepo: 'user/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: 'username_xyz',
    });

    const result = await verifier.verifyAndPublish(sampleArchivePayload);
    expect(result).toBeNull();
  });
});
