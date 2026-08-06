import { SettingsStorage } from '../storage/settings';
import { SecretsStorage } from '../storage/secrets';
import { GitHubAuthService } from '../github/auth';
import { RepositoryValidator, RepositoryValidationReport } from '../github/repository-validator';
import { SecurityValidation } from '../security/validation';
import { TokenSecurity } from '../security/token';
import { LeetCodeAccountDetector } from '../leetcode/account-detector';
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

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const authService = new GitHubAuthService();

  // Load stored credentials & settings
  const settings = await SettingsStorage.getSettings();
  const storedToken = await SecretsStorage.getToken();

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

  // Populate or auto-detect LeetCode account
  if (settings.leetcodeUsername) {
    leetcodeUsernameInput.value = settings.leetcodeUsername;
    manualAccountContainer.style.display = 'block';
    if (accountStatusDisplay) {
      accountStatusDisplay.textContent = `Linked LeetCode Account: @${settings.leetcodeUsername}`;
      accountStatusDisplay.style.color = '#34d399';
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
          accountStatusDisplay.style.color = '#34d399';
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
        accountStatusDisplay.style.color = '#34d399';
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

  const runComprehensiveValidation = async (): Promise<void> => {
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

    tokenInput.value = sanitizedToken;
    if (validateBtn) {
      validateBtn.disabled = true;
      validateBtn.textContent = 'Validating Configuration...';
    }
    if (testConnBtn) {
      testConnBtn.disabled = true;
      testConnBtn.textContent = 'Validating...';
    }

    const validator = new RepositoryValidator(sanitizedToken);
    const report = await validator.validateRepositoryScope(repoInfo.fullName);

    if (validateBtn) {
      validateBtn.disabled = false;
      validateBtn.textContent = 'Validate Configuration';
    }
    if (testConnBtn) {
      testConnBtn.disabled = false;
      testConnBtn.textContent = '🔍 Test Connection & Save';
    }

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
      showToast('✓ GitHub configuration verified', 'success');
    } else {
      showToast('❌ GitHub configuration validation failed', 'error');
    }

    renderDiagnosticReport(report);
    updateStatusBadge(report.isValid);
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
      <div class="report-summary ${report.isValid ? 'success' : 'failure'}" style="font-family: monospace; white-space: pre-wrap; line-height: 1.6; padding: 16px; border-radius: 8px;">
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
