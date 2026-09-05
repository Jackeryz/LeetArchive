import {
  ArchivePublishedPayload,
  ArchivePublishFailedPayload,
  EventBus,
  PushCancelledPayload,
  PushPromptRequestedPayload,
  PushRequestedPayload,
} from '../core/events';
import { logger } from '../utils/logger';

export type UIState = 'prompting' | 'pushing' | 'success' | 'failure';

interface ActivePrompt {
  requestId: string;
  payload: PushPromptRequestedPayload;
  state: UIState;
  errorMessage?: string;
  containerElement: HTMLElement | null;
  autoDismissTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Lightweight, unobtrusive in-page UI rendered on LeetCode pages.
 * Displays push confirmation prompts, loading states, success toasts, and error dialogs.
 * Uses semantic HTML and ARIA attributes rather than fragile LeetCode CSS selectors.
 */
export class PushNotificationUI {
  private unsubscribes: Array<() => void> = [];
  private isListening: boolean = false;
  private activePrompts: Map<string, ActivePrompt> = new Map();

  /**
   * Starts listening for push decision and publisher result events.
   */
  start(): void {
    if (this.isListening) {
      logger.debug('[PushNotificationUI] Already listening for push UI events.');
      return;
    }

    logger.debug('[PushNotificationUI] Starting push notification UI listener...');
    this.isListening = true;

    const eventBus = EventBus.getInstance();

    this.unsubscribes.push(
      eventBus.subscribe<PushPromptRequestedPayload>('PushPromptRequested', (event) => {
        this.handlePromptRequested(event.payload);
      }),
    );

    this.unsubscribes.push(
      eventBus.subscribe<PushRequestedPayload>('PushRequested', (event) => {
        this.handlePushRequested(event.payload);
      }),
    );

    this.unsubscribes.push(
      eventBus.subscribe<PushCancelledPayload>('PushCancelled', (event) => {
        this.handlePushCancelled(event.payload);
      }),
    );

    this.unsubscribes.push(
      eventBus.subscribe<ArchivePublishedPayload>('ArchivePublished', (event) => {
        this.handleArchivePublished(event.payload);
      }),
    );

    this.unsubscribes.push(
      eventBus.subscribe<ArchivePublishFailedPayload>('ArchivePublishFailed', (event) => {
        this.handleArchivePublishFailed(event.payload);
      }),
    );
  }

  /**
   * Handles incoming PushPromptRequested event ('ask' mode).
   */
  public handlePromptRequested(payload: PushPromptRequestedPayload): void {
    logger.info(
      `[PushNotificationUI] Presenting push prompt for problem '${payload.verifiedPayload.archive.problemSlug}'`,
    );

    // If a prompt already exists for this requestId, update it
    let active = this.activePrompts.get(payload.requestId);
    if (!active) {
      active = {
        requestId: payload.requestId,
        payload,
        state: 'prompting',
        containerElement: null,
      };
      this.activePrompts.set(payload.requestId, active);
    } else {
      active.payload = payload;
      active.state = 'prompting';
    }

    this.renderToast(active);
  }

  /**
   * Handles incoming PushRequested event (transitions UI to pushing state).
   */
  public handlePushRequested(payload: PushRequestedPayload): void {
    const active = this.activePrompts.get(payload.requestId);
    if (active) {
      active.state = 'pushing';
      this.renderToast(active);
    }
  }

  /**
   * Handles incoming PushCancelled event (dismisses UI).
   */
  public handlePushCancelled(payload: PushCancelledPayload): void {
    const active = this.activePrompts.get(payload.requestId);
    if (active) {
      this.removeToast(active);
      this.activePrompts.delete(payload.requestId);
    }
  }

  /**
   * Handles incoming ArchivePublished event (transitions UI to success state).
   */
  public handleArchivePublished(payload: ArchivePublishedPayload): void {
    // Find matching prompt by requestId or fallback to the latest active prompt
    let active: ActivePrompt | undefined;
    if (payload.requestId) {
      active = this.activePrompts.get(payload.requestId);
    }
    if (!active && this.activePrompts.size > 0) {
      active = Array.from(this.activePrompts.values())[0];
    }

    if (active) {
      active.state = 'success';
      this.renderToast(active);

      // Auto-dismiss after 3 seconds
      if (active.autoDismissTimer) clearTimeout(active.autoDismissTimer);
      active.autoDismissTimer = setTimeout(() => {
        if (active) {
          this.removeToast(active);
          this.activePrompts.delete(active.requestId);
        }
      }, 3000);
    }
  }

  /**
   * Handles incoming ArchivePublishFailed event (transitions UI to failure state).
   */
  public handleArchivePublishFailed(payload: ArchivePublishFailedPayload): void {
    let active: ActivePrompt | undefined;
    if (payload.requestId) {
      active = this.activePrompts.get(payload.requestId);
    }
    if (!active && this.activePrompts.size > 0) {
      active = Array.from(this.activePrompts.values())[0];
    }

    if (active) {
      active.state = 'failure';
      active.errorMessage = payload.error;
      this.renderToast(active);
    }
  }

  /**
   * Renders or updates the toast DOM element.
   */
  private renderToast(active: ActivePrompt): void {
    if (typeof document === 'undefined' || !document.body) return;

    let el = active.containerElement;
    if (!el || !document.body.contains(el)) {
      el = document.createElement('div');
      el.id = `leetarchive-push-toast-${active.requestId}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.className = 'leetarchive-toast-container';

      // Inline styles to isolate from host page CSS
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: '2147483647',
        backgroundColor: '#151d30',
        color: '#f8fafc',
        border: '1px solid #38bdf8',
        borderRadius: '10px',
        padding: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        maxWidth: '340px',
        lineHeight: '1.4',
      });

      document.body.appendChild(el);
      active.containerElement = el;
    }

    const { archive } = active.payload.verifiedPayload;
    const repo = active.payload.repository;
    const branch = active.payload.branch;

    if (active.state === 'prompting') {
      const isRepoConfigured = Boolean(repo && repo.trim());
      el.innerHTML = `
        <div style="font-weight:700; color:#38bdf8; margin-bottom:4px; font-size:14px;">📦 Solution Archived</div>
        <div style="font-weight:600; margin-bottom:2px;">${this.escapeHtml(archive.problemTitle)}</div>
        <div style="color:#94a3b8; font-size:12px; margin-bottom:8px;">Language: ${this.escapeHtml(archive.language)}</div>
        ${
          isRepoConfigured
            ? `<div style="font-size:12px; margin-bottom:12px; background:rgba(255,255,255,0.05); padding:6px; border-radius:4px;">
                Push solution to:<br/>
                <strong style="color:#f8fafc;">${this.escapeHtml(repo!)}</strong> (branch: ${this.escapeHtml(branch)})
               </div>`
            : `<div style="font-size:12px; color:#f59e0b; margin-bottom:12px; background:rgba(245,158,11,0.1); padding:6px; border-radius:4px;">
                ⚠️ GitHub repository is not configured. Open LeetArchive settings to configure target repository.
               </div>`
        }
        <div style="display:flex; gap:8px;">
          <button data-action="push" ${!isRepoConfigured ? 'disabled' : ''} style="flex:1; padding:8px 12px; background:${isRepoConfigured ? '#38bdf8' : '#334155'}; color:#0b0f19; border:none; border-radius:6px; font-weight:600; cursor:${isRepoConfigured ? 'pointer' : 'not-allowed'}; font-size:12px;">Push to GitHub</button>
          <button data-action="cancel" style="padding:8px 12px; background:#334155; color:#f8fafc; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px;">Not Now</button>
        </div>
      `;

      const pushBtn = el.querySelector('[data-action="push"]');
      const cancelBtn = el.querySelector('[data-action="cancel"]');

      if (pushBtn && isRepoConfigured) {
        pushBtn.addEventListener('click', () => {
          active.state = 'pushing';
          this.renderToast(active);
          EventBus.getInstance().publish('PushRequested', {
            requestId: active.requestId,
            verifiedPayload: active.payload.verifiedPayload,
          });
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          EventBus.getInstance().publish('PushCancelled', {
            requestId: active.requestId,
            problemTitle: archive.problemTitle,
            problemSlug: archive.problemSlug,
            reason: 'User clicked Not Now',
          });
        });
      }
    } else if (active.state === 'pushing') {
      el.innerHTML = `
        <div style="font-weight:700; color:#38bdf8; margin-bottom:4px; font-size:14px;">⏳ Pushing to GitHub...</div>
        <div style="font-weight:600; margin-bottom:2px;">${this.escapeHtml(archive.problemTitle)}</div>
        <div style="color:#94a3b8; font-size:12px;">Target: ${this.escapeHtml(repo || '')} (${this.escapeHtml(branch)})</div>
      `;
    } else if (active.state === 'success') {
      el.innerHTML = `
        <div style="font-weight:700; color:#22c55e; margin-bottom:4px; font-size:14px;">✓ Pushed to GitHub</div>
        <div style="font-weight:600; margin-bottom:2px;">${this.escapeHtml(archive.problemTitle)}</div>
        <div style="color:#94a3b8; font-size:12px;">${this.escapeHtml(repo || '')}</div>
      `;
    } else if (active.state === 'failure') {
      const errText = active.errorMessage || 'An error occurred during push.';
      el.innerHTML = `
        <div style="font-weight:700; color:#ef4444; margin-bottom:4px; font-size:14px;">Couldn't push to GitHub</div>
        <div style="font-size:12px; color:#f8fafc; margin-bottom:8px;">${this.escapeHtml(errText)}</div>
        <div style="display:flex; gap:8px;">
          <button data-action="retry" style="flex:1; padding:8px 12px; background:#38bdf8; color:#0b0f19; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px;">Try Again</button>
          <button data-action="dismiss" style="padding:8px 12px; background:#334155; color:#f8fafc; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px;">Dismiss</button>
        </div>
      `;

      const retryBtn = el.querySelector('[data-action="retry"]');
      const dismissBtn = el.querySelector('[data-action="dismiss"]');

      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          active.state = 'pushing';
          this.renderToast(active);
          EventBus.getInstance().publish('PushRequested', {
            requestId: active.requestId,
            verifiedPayload: active.payload.verifiedPayload,
          });
        });
      }

      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          this.removeToast(active);
          this.activePrompts.delete(active.requestId);
        });
      }
    }
  }

  /**
   * Safely removes the toast DOM element.
   */
  private removeToast(active: ActivePrompt): void {
    if (active.autoDismissTimer) clearTimeout(active.autoDismissTimer);
    if (active.containerElement && active.containerElement.parentNode) {
      active.containerElement.parentNode.removeChild(active.containerElement);
    }
    active.containerElement = null;
  }

  /**
   * Helper to escape HTML characters.
   */
  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Stops listening for events and cleans up DOM toasts.
   */
  stop(): void {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes = [];
    this.isListening = false;

    for (const active of this.activePrompts.values()) {
      this.removeToast(active);
    }
    this.activePrompts.clear();
    logger.debug('[PushNotificationUI] Stopped push notification UI listener.');
  }
}
