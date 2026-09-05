import { SettingsStorage } from '../storage/settings';
import { SecretsStorage } from '../storage/secrets';
import { GitHubAuthService } from '../github/auth';
import { RepositoryValidator, RepositoryValidationReport } from '../github/repository-validator';
import { SecurityValidation } from '../security/validation';
import { TokenSecurity } from '../security/token';
import { LeetCodeAccountDetector } from '../leetcode/account-detector';
import { PushBehavior, ThemePreference } from '../types/leetcode';
import { logger } from '../utils/logger';

document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Initializing LeetArchive Options Page...');

  const tokenInput = document.getElementById('github-token') as HTMLInputElement;
  const toggleVisibilityBtn = document.getElementById(
    'toggle-token-visibility',
  ) as HTMLButtonElement;
  const validateBtn = document.getElementById('validate-token-btn') as HTMLButtonElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
  const repoUrlInput = document.getElementById('repo-url') as HTMLInputElement;
  const testConnBtn = document.getElementById('test-connection-btn') as HTMLButtonElement;
  const statusBadge = document.getElementById('conn-status-badge') as HTMLDivElement;
  const reportCard = document.getElementById('test-report-card') as HTMLDivElement;
  const reportContent = document.getElementById('report-content') as HTMLDivElement;
  const statusToast = document.getElementById('save-status') as HTMLDivElement;

  // Validation progress elements
  const progressBox = document.getElementById('validation-progress') as HTMLDivElement;
  const progressStepsList = document.getElementById('progress-steps-list') as HTMLUListElement;

  // Section 3: LeetCode Account Linking Elements
  const autoDetectedContainer = document.getElementById(
    'auto-detected-account-container',
  ) as HTMLDivElement;
  const detectedDisplay = document.getElementById('detected-username-display') as HTMLElement;
  const useDetectedBtn = document.getElementById('use-detected-account-btn') as HTMLButtonElement;
  const chooseAnotherBtn = document.getElementById(
    'choose-another-account-btn',
  ) as HTMLButtonElement;
  const manualAccountContainer = document.getElementById(
    'manual-account-container',
  ) as HTMLDivElement;
  const leetcodeUsernameInput = document.getElementById('leetcode-username') as HTMLInputElement;
  const saveLeetcodeUsernameBtn = document.getElementById(
    'save-leetcode-username-btn',
  ) as HTMLButtonElement;
  const accountStatusDisplay = document.getElementById('linked-account-status') as HTMLDivElement;

  // Section 4: Push Behavior Element
  const pushBehaviorSelect = document.getElementById('push-behavior-select') as HTMLSelectElement;

  // Section 5: Theme Element
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let isValidating = false;
  const authService = new GitHubAuthService();

  // Load stored credentials & settings
  const settings = await SettingsStorage.getSettings();
  const storedToken = await SecretsStorage.getToken();

  // Initialize theme
  function applyTheme(theme: ThemePreference): void {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  const currentTheme = settings.theme || 'system';
  applyTheme(currentTheme);
  if (themeSelect) {
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', async () => {
      const selectedTheme = themeSelect.value as ThemePreference;
      await SettingsStorage.saveSettings({ theme: selectedTheme });
      applyTheme(selectedTheme);
      showToast(`Theme updated to '${selectedTheme}'`, 'success');
    });
  }

  if (settings.selectedRepo) {
    repoUrlInput.value = `https://github.com/${settings.selectedRepo}`;
  }

  if (storedToken) {
    tokenInput.value = storedToken;
    disconnectBtn.style.display = 'inline-block';
    if (settings.selectedRepo) {
      updateStatusBadge(true);
    }
  }

  // Populate Push Behavior setting
  if (pushBehaviorSelect) {
    pushBehaviorSelect.value = settings.pushBehavior || 'ask';
    pushBehaviorSelect.addEventListener('change', async () => {
      const selectedBehavior = pushBehaviorSelect.value as PushBehavior;
      await SettingsStorage.saveSettings({ pushBehavior: selectedBehavior });
      showToast(`Push behavior updated to '${selectedBehavior}'`, 'success');
    });
  }

  // Populate or auto-detect LeetCode account
  if (settings.leetcodeUsername) {
    leetcodeUsernameInput.value = settings.leetcodeUsername;
    manualAccountContainer.style.display = 'block';
    if (accountStatusDisplay) {
      accountStatusDisplay.textContent = `Linked LeetCode Account: @${settings.leetcodeUsername}`;
      accountStatusDisplay.style.color = 'var(--success)';
    }
  } else {
    // Attempt automatic detection for onboarding
    const detectedUsername = await LeetCodeAccountDetector.detectFromLeetCodeSite();
    if (detectedUsername && autoDetectedContainer && detectedDisplay) {
      detectedDisplay.textContent = `@${detectedUsername}`;
      autoDetectedContainer.style.display = 'block';

      useDetectedBtn.addEventListener('click', async () => {
        await SettingsStorage.saveSettings({ leetcodeUsername: detectedUsername });
        autoDetectedContainer.style.display = 'none';
        leetcodeUsernameInput.value = detectedUsername;
        manualAccountContainer.style.display = 'block';
        if (accountStatusDisplay) {
          accountStatusDisplay.textContent = `Linked LeetCode Account: @${detectedUsername}`;
          accountStatusDisplay.style.color = 'var(--success)';
        }
        showToast(`Linked LeetCode account saved as @${detectedUsername}`, 'success');
      });

      chooseAnotherBtn.addEventListener('click', () => {
        autoDetectedContainer.style.display = 'none';
        manualAccountContainer.style.display = 'block';
      });
    } else {
      manualAccountContainer.style.display = 'block';
    }
  }

  if (saveLeetcodeUsernameBtn) {
    saveLeetcodeUsernameBtn.addEventListener('click', async () => {
      const rawUser = leetcodeUsernameInput.value;
      const validated = LeetCodeAccountDetector.cleanAndValidateUsername(rawUser);

      if (!validated) {
        showToast('Please enter a valid LeetCode username', 'error');
        return;
      }

      await SettingsStorage.saveSettings({ leetcodeUsername: validated });
      leetcodeUsernameInput.value = validated;
      if (accountStatusDisplay) {
        accountStatusDisplay.textContent = `Linked LeetCode Account: @${validated}`;
        accountStatusDisplay.style.color = 'var(--success)';
      }
      showToast(`Linked LeetCode account updated to @${validated}`, 'success');
    });
  }

  // Toggle token input visibility
  if (toggleVisibilityBtn) {
    toggleVisibilityBtn.addEventListener('click', () => {
      if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        toggleVisibilityBtn.textContent = '🙈';
      } else {
        tokenInput.type = 'password';
        toggleVisibilityBtn.textContent = '👁️';
      }
    });
  }

  function renderProgressSteps(
    steps: { label: string; status: 'done' | 'pending' | 'failed' }[],
  ): void {
    if (!progressBox || !progressStepsList) return;
    progressBox.style.display = 'block';
    progressStepsList.innerHTML = steps
      .map(
        (s) =>
          `<li class="${s.status}"><span>${s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : '●'}</span> <span>${SecurityValidation.escapeHtml(s.label)}</span></li>`,
      )
      .join('');
  }

  const runComprehensiveValidation = async (): Promise<void> => {
    if (isValidating) return;

    const rawToken = tokenInput.value;
    const sanitizedToken = TokenSecurity.sanitizeToken(rawToken);
    const rawUrl = repoUrlInput.value;

    if (!sanitizedToken) {
      showToast('Please enter a GitHub Fine-Grained PAT token', 'error');
      return;
    }
    if (!rawUrl || !rawUrl.trim()) {
      showToast('Please enter a GitHub repository URL or owner/repository name', 'error');
      return;
    }

    const repoInfo = SecurityValidation.parseGitHubRepoUrl(rawUrl);
    if (!repoInfo) {
      showToast(
        'Invalid repository URL. Format must be https://github.com/owner/repository or owner/repository.',
        'error',
      );
      return;
    }

    isValidating = true;
    tokenInput.value = sanitizedToken;
    logger.info('[Diagnostic] runComprehensiveValidation initiated');
    logger.info('[Diagnostic] Token source: directly read from tokenInput.value');
    logger.info(
      `[Diagnostic] Token fingerprint: ${TokenSecurity.maskToken(sanitizedToken)} (length: ${sanitizedToken.length})`,
    );
    logger.info(`[Diagnostic] Configured target repository: ${repoInfo.fullName}`);
    if (validateBtn) {
      validateBtn.disabled = true;
      validateBtn.textContent = 'Validating Configuration...';
    }
    if (testConnBtn) {
      testConnBtn.disabled = true;
      testConnBtn.textContent = 'Validating...';
    }

    // Stream initial progress UI
    renderProgressSteps([
      { label: 'PAT authentication', status: 'pending' },
      { label: `Repository location (${repoInfo.fullName})`, status: 'pending' },
      { label: 'PAT repository access scope', status: 'pending' },
      { label: 'Contents Read & Write permission', status: 'pending' },
      { label: 'Default branch detection', status: 'pending' },
    ]);

    try {
      const validator = new RepositoryValidator(sanitizedToken);
      const report = await validator.validateRepositoryScope(repoInfo.fullName);

      // Update progress UI based on report status
      const userLabel = report.authenticatedUser
        ? `PAT authenticated (@${report.authenticatedUser})`
        : 'PAT authentication';

      renderProgressSteps([
        { label: userLabel, status: report.tokenValid ? 'done' : 'failed' },
        {
          label: `Repository location (${repoInfo.fullName})`,
          status: report.repoExists ? 'done' : 'failed',
        },
        {
          label: 'PAT repository access scope',
          status:
            report.status === 'pat-invalid' ||
            report.status === 'repository-not-found' ||
            report.status === 'repository-inaccessible'
              ? 'failed'
              : 'done',
        },
        {
          label: 'Contents Read & Write permission',
          status: report.hasWritePermission ? 'done' : 'failed',
        },
        {
          label: `Default branch detected (${report.repoDetails?.defaultBranch || 'main'})`,
          status: report.isValid ? 'done' : 'pending',
        },
      ]);

      const defaultBranch = report.repoDetails?.defaultBranch || 'main';

      if (report.isValid) {
        const finalRepo = report.repoDetails?.fullName || repoInfo.fullName;
        await SecretsStorage.setToken(sanitizedToken);
        await SettingsStorage.saveSettings({
          selectedRepo: finalRepo,
          branch: defaultBranch,
        });

        repoUrlInput.value = `https://github.com/${finalRepo}`;
        disconnectBtn.style.display = 'inline-block';
        showToast('✓ GitHub configuration verified & saved', 'success');
      } else {
        if (report.status === 'pat-invalid') {
          showToast('✕ Invalid Personal Access Token', 'error');
        } else if (report.status === 'repository-not-found') {
          showToast('✕ Repository not found', 'error');
        } else if (report.status === 'repository-inaccessible') {
          showToast('✕ PAT does not have access to this repository', 'error');
        } else if (report.status === 'read-only') {
          showToast('✕ Write permission required', 'error');
        } else {
          showToast('✕ GitHub configuration validation failed', 'error');
        }
      }

      renderDiagnosticReport(report);
      updateStatusBadge(report.isValid);

      logger.info('================= VALIDATION DIAGNOSTIC SUMMARY =================');
      logger.info(`* configured repo: ${repoInfo.fullName}`);
      logger.info(
        `* token fingerprint: ${TokenSecurity.maskToken(sanitizedToken)} (length: ${sanitizedToken.length})`,
      );
      logger.info(`* authenticated user: ${report.authenticatedUser || 'null'}`);
      logger.info(
        `* contents probe HTTP status: ${report.contentsProbeStatus !== undefined ? report.contentsProbeStatus : 'not called'}`,
      );
      logger.info(`* validator status: ${report.status}`);
      logger.info(`* validator isValid: ${report.isValid}`);
      logger.info(`* persisted config changed: ${report.isValid}`);
      logger.info(
        `* displayed UI status: ${report.isValid ? 'Connected & Validated' : 'Disconnected / Pending Test'}`,
      );
      logger.info('================================================================');
    } finally {
      isValidating = false;
      if (validateBtn) {
        validateBtn.disabled = false;
        validateBtn.textContent = 'Validate Configuration';
      }
      if (testConnBtn) {
        testConnBtn.disabled = false;
        testConnBtn.textContent = '🔍 Test Connection & Save';
      }
    }
  };

  // Validate Configuration button
  if (validateBtn) {
    validateBtn.addEventListener('click', runComprehensiveValidation);
  }

  // Test Connection & Save button
  if (testConnBtn) {
    testConnBtn.addEventListener('click', runComprehensiveValidation);
  }

  // Disconnect button
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      if (
        confirm(
          'Are you sure you want to remove your GitHub credentials and disconnect LeetArchive?',
        )
      ) {
        disconnectBtn.disabled = true;
        await authService.logout();
        tokenInput.value = '';
        repoUrlInput.value = '';
        disconnectBtn.style.display = 'none';
        disconnectBtn.disabled = false;
        reportCard.style.display = 'none';
        if (progressBox) progressBox.style.display = 'none';
        updateStatusBadge(false);
        showToast('Credentials disconnected and cleared', 'info');
      }
    });
  }

  function updateStatusBadge(connected: boolean): void {
    if (!statusBadge) return;
    if (connected) {
      statusBadge.textContent = 'Connected & Validated';
      statusBadge.className = 'badge connected';
    } else {
      statusBadge.textContent = 'Disconnected / Pending Test';
      statusBadge.className = 'badge disconnected';
    }
  }

  function renderDiagnosticReport(report: RepositoryValidationReport): void {
    reportCard.style.display = 'block';
    reportContent.innerHTML = '';

    const formattedLines = report.formattedOutput
      .split('\n')
      .map((line) => SecurityValidation.escapeHtml(line))
      .join('<br/>');

    reportContent.innerHTML = `
      <div class="report-summary ${report.isValid ? 'success' : 'failure'}">
        ${formattedLines}
      </div>
    `;
  }

  function showToast(message: string, type: 'success' | 'error' | 'info'): void {
    if (!statusToast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    statusToast.textContent = message;
    statusToast.className = `status-toast visible ${type}`;
    toastTimer = setTimeout(() => {
      statusToast.className = 'status-toast';
    }, 4000);
  }
});
