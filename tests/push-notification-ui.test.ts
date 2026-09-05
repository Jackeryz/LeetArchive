import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountVerifiedPayload,
  ArchivePublishedPayload,
  ArchivePublishFailedPayload,
  EventBus,
  PushCancelledPayload,
  PushPromptRequestedPayload,
  PushRequestedPayload,
} from '../src/core/events';
import { PushNotificationUI } from '../src/leetcode/push-notification-ui';

function setupMockDOM() {
  const elements = new Map<string, any>();
  const bodyChildren: any[] = [];

  function createMockElement(tag: string): any {
    const listeners: Record<string, Function[]> = {};
    const attrs: Record<string, string> = {};
    let innerHTMLValue = '';
    let childButtons: any[] = [];

    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      style: {},
      parentNode: null as any,
      setAttribute: (name: string, val: string) => {
        attrs[name] = val;
        if (name === 'id') el.id = val;
        if (name === 'class') el.className = val;
      },
      getAttribute: (name: string) => attrs[name] || null,
      addEventListener: (evt: string, fn: Function) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      click: () => {
        if (listeners['click']) {
          for (const fn of listeners['click']) fn();
        }
      },
      querySelector: (selector: string) => {
        const match = selector.match(/\[data-action="([^"]+)"\]/);
        if (match) {
          const action = match[1];
          return childButtons.find((b) => b.getAttribute('data-action') === action) || null;
        }
        return null;
      },
    };

    Object.defineProperty(el, 'innerHTML', {
      get: () => innerHTMLValue,
      set: (val: string) => {
        innerHTMLValue = val;
        childButtons = [];
        const actionMatches = val.matchAll(/data-action="([^"]+)"/g);
        for (const m of actionMatches) {
          const action = m[1];
          const btn = createMockElement('button');
          btn.setAttribute('data-action', action);
          childButtons.push(btn);
        }
      },
    });

    return el;
  }

  const mockBody = {
    appendChild: (child: any) => {
      bodyChildren.push(child);
      child.parentNode = mockBody;
      if (child.id) elements.set(child.id, child);
    },
    removeChild: (child: any) => {
      const idx = bodyChildren.indexOf(child);
      if (idx !== -1) bodyChildren.splice(idx, 1);
      child.parentNode = null;
      if (child.id) elements.delete(child.id);
    },
    contains: (child: any) => bodyChildren.includes(child),
  };

  const mockDocument = {
    body: mockBody,
    createElement: (tag: string) => createMockElement(tag),
    querySelector: (selector: string) => {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return elements.get(id) || null;
      }
      return null;
    },
  };

  (globalThis as any).document = mockDocument;
  (globalThis as any).window = globalThis;
}

describe('PushNotificationUI', () => {
  let ui: PushNotificationUI;
  let eventBus: EventBus;

  beforeEach(() => {
    setupMockDOM();
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    ui = new PushNotificationUI();
    vi.useFakeTimers();
  });

  afterEach(() => {
    ui.stop();
    eventBus.clearAllListeners();
    vi.useRealTimers();
  });

  const sampleVerifiedPayload: AccountVerifiedPayload = {
    username: 'username_xyz',
    verifiedAt: 123456789,
    archive: {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'Python3',
      timestamp: 123456789,
      archiveMode: 'folder',
      files: [
        { path: 'Two Sum/README.md', content: '# Two Sum' },
        { path: 'Two Sum/solution.py', content: 'print("hello")' },
      ],
    },
  };

  const samplePromptPayload: PushPromptRequestedPayload = {
    requestId: 'req_100',
    verifiedPayload: sampleVerifiedPayload,
    repository: 'octocat/leetcode-solutions',
    branch: 'main',
  };

  it('renders prompt UI when PushPromptRequested is emitted', () => {
    ui.start();
    eventBus.publish('PushPromptRequested', samplePromptPayload);

    const toast = document.querySelector('#leetarchive-push-toast-req_100') as any;
    expect(toast).not.toBeNull();
    expect(toast?.innerHTML).toContain('Solution Archived');
    expect(toast?.innerHTML).toContain('Two Sum');
    expect(toast?.innerHTML).toContain('octocat/leetcode-solutions');

    const pushBtn = toast?.querySelector('[data-action="push"]');
    const cancelBtn = toast?.querySelector('[data-action="cancel"]');
    expect(pushBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
  });

  it('publishes PushRequested when Push to GitHub button is clicked', () => {
    ui.start();

    let pushRequestedEvent: PushRequestedPayload | null = null;
    eventBus.subscribe<PushRequestedPayload>('PushRequested', (ev) => {
      pushRequestedEvent = ev.payload;
    });

    eventBus.publish('PushPromptRequested', samplePromptPayload);
    const toast = document.querySelector('#leetarchive-push-toast-req_100') as any;
    const pushBtn = toast?.querySelector('[data-action="push"]');

    pushBtn?.click();

    expect(pushRequestedEvent).not.toBeNull();
    expect(pushRequestedEvent!.requestId).toBe('req_100');
    expect(toast?.innerHTML).toContain('Pushing to GitHub...');
  });

  it('publishes PushCancelled and dismisses UI when Not Now is clicked', () => {
    ui.start();

    let cancelEvent: PushCancelledPayload | null = null;
    eventBus.subscribe<PushCancelledPayload>('PushCancelled', (ev) => {
      cancelEvent = ev.payload;
    });

    eventBus.publish('PushPromptRequested', samplePromptPayload);
    const toast = document.querySelector('#leetarchive-push-toast-req_100') as any;
    const cancelBtn = toast?.querySelector('[data-action="cancel"]');

    cancelBtn?.click();

    expect(cancelEvent).not.toBeNull();
    expect(cancelEvent!.requestId).toBe('req_100');
    expect(document.querySelector('#leetarchive-push-toast-req_100')).toBeNull();
  });

  it('transitions UI to success state on ArchivePublished and auto-dismisses', () => {
    ui.start();
    eventBus.publish('PushPromptRequested', samplePromptPayload);

    const publishedPayload: ArchivePublishedPayload = {
      repository: 'octocat/leetcode-solutions',
      branch: 'main',
      commitSha: 'sha123',
      committedFiles: 2,
      publishedAt: Date.now(),
      requestId: 'req_100',
    };

    eventBus.publish('ArchivePublished', publishedPayload);

    const toast = document.querySelector('#leetarchive-push-toast-req_100') as any;
    expect(toast?.innerHTML).toContain('Pushed to GitHub');

    // Advance timer for auto-dismiss
    vi.advanceTimersByTime(3500);
    expect(document.querySelector('#leetarchive-push-toast-req_100')).toBeNull();
  });

  it('transitions UI to failure state on ArchivePublishFailed and allows Try Again', () => {
    ui.start();
    eventBus.publish('PushPromptRequested', samplePromptPayload);

    const failedPayload: ArchivePublishFailedPayload = {
      requestId: 'req_100',
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      error: 'Resource not accessible by personal access token',
      failedAt: Date.now(),
    };

    eventBus.publish('ArchivePublishFailed', failedPayload);

    const toast = document.querySelector('#leetarchive-push-toast-req_100') as any;
    expect(toast?.innerHTML).toContain("Couldn't push to GitHub");
    expect(toast?.innerHTML).toContain('Resource not accessible');

    let retryEvent: PushRequestedPayload | null = null;
    eventBus.subscribe<PushRequestedPayload>('PushRequested', (ev) => {
      retryEvent = ev.payload;
    });

    const retryBtn = toast?.querySelector('[data-action="retry"]');
    expect(retryBtn).not.toBeNull();

    retryBtn?.click();

    expect(retryEvent).not.toBeNull();
    expect(retryEvent!.requestId).toBe('req_100');
    expect(toast?.innerHTML).toContain('Pushing to GitHub...');
  });
});
