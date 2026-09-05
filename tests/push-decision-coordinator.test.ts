import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountVerifiedPayload,
  EventBus,
  PushCancelledPayload,
  PushPromptRequestedPayload,
  PushRequestedPayload,
} from '../src/core/events';
import { PushDecisionCoordinator } from '../src/leetcode/push-decision-coordinator';
import { SettingsStorage } from '../src/storage/settings';

describe('PushDecisionCoordinator', () => {
  let coordinator: PushDecisionCoordinator;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    coordinator = new PushDecisionCoordinator();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    coordinator.stop();
    eventBus.clearAllListeners();
  });

  const mockPayload: AccountVerifiedPayload = {
    username: 'test_user',
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

  it('defaults to ask mode and emits PushPromptRequested when pushBehavior is not explicitly set', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'ghp_test',
      selectedRepo: 'owner/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    let emittedPrompt: PushPromptRequestedPayload | null = null;
    eventBus.subscribe<PushPromptRequestedPayload>('PushPromptRequested', (event) => {
      emittedPrompt = event.payload;
    });

    const mode = await coordinator.handleAccountVerified(mockPayload);
    expect(mode).toBe('ask');
    expect(emittedPrompt).not.toBeNull();
    expect(emittedPrompt!.verifiedPayload.archive.problemSlug).toBe('two-sum');
    expect(emittedPrompt!.repository).toBe('owner/repo');
    expect(emittedPrompt!.branch).toBe('main');
  });

  it('emits PushPromptRequested when pushBehavior is ask', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'ghp_test',
      selectedRepo: 'owner/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      pushBehavior: 'ask',
    });

    let emittedPrompt: PushPromptRequestedPayload | null = null;
    eventBus.subscribe<PushPromptRequestedPayload>('PushPromptRequested', (event) => {
      emittedPrompt = event.payload;
    });

    const mode = await coordinator.handleAccountVerified(mockPayload);
    expect(mode).toBe('ask');
    expect(emittedPrompt).not.toBeNull();
    expect(emittedPrompt!.verifiedPayload.archive.files.length).toBe(2);
  });

  it('emits PushRequested when pushBehavior is automatic', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'ghp_test',
      selectedRepo: 'owner/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      pushBehavior: 'automatic',
    });

    let emittedRequest: PushRequestedPayload | null = null;
    eventBus.subscribe<PushRequestedPayload>('PushRequested', (event) => {
      emittedRequest = event.payload;
    });

    const mode = await coordinator.handleAccountVerified(mockPayload);
    expect(mode).toBe('automatic');
    expect(emittedRequest).not.toBeNull();
    expect(emittedRequest!.verifiedPayload.archive.problemTitle).toBe('Two Sum');
  });

  it('emits PushCancelled when pushBehavior is never', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'ghp_test',
      selectedRepo: 'owner/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      pushBehavior: 'never',
    });

    let emittedCancel: PushCancelledPayload | null = null;
    eventBus.subscribe<PushCancelledPayload>('PushCancelled', (event) => {
      emittedCancel = event.payload;
    });

    const mode = await coordinator.handleAccountVerified(mockPayload);
    expect(mode).toBe('never');
    expect(emittedCancel).not.toBeNull();
    expect(emittedCancel!.problemSlug).toBe('two-sum');
    expect(emittedCancel!.reason).toContain('never');
  });

  it('starts and listens for AccountVerified events on EventBus', async () => {
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'ghp_test',
      selectedRepo: 'owner/repo',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      pushBehavior: 'automatic',
    });

    coordinator.start();

    let emittedRequest: PushRequestedPayload | null = null;
    eventBus.subscribe<PushRequestedPayload>('PushRequested', (event) => {
      emittedRequest = event.payload;
    });

    eventBus.publish('AccountVerified', mockPayload);

    // Allow promise tick
    await new Promise((r) => setTimeout(r, 10));

    expect(emittedRequest).not.toBeNull();
  });
});
