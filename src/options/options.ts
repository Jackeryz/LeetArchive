import { SettingsStorage } from '../storage/settings';
import { SecretsStorage } from '../storage/secrets';
import { GitHubAuthService } from '../github/auth';
import { RepositoryValidator, RepositoryValidationReport } from '../github/repository-validator';
import { SecurityValidation } from '../security/validation';
import { TokenSecurity } from '../security/token';
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

  // Validate PAT button
  if (validateBtn) {
    validateBtn.addEventListener('click', async () => {
      const rawToken = tokenInput.value;
      const sanitizedToken = TokenSecurity.sanitizeToken(rawToken);

      if (!sanitizedToken) {
        showToast('Please enter a GitHub Fine-Grained PAT token', 'error');
        return;
      }
      tokenInput.value = sanitizedToken;

      validateBtn.disabled = true;
      validateBtn.textContent = 'Validating PAT...';

      const result = await authService.validateToken(sanitizedToken);

      validateBtn.disabled = false;
      validateBtn.textContent = 'Validate PAT';

      if (result.user) {
        await SecretsStorage.setToken(sanitizedToken);
        disconnectBtn.style.display = 'inline-block';
        showToast(`Authenticated as @${result.user.login}`, 'success');
      } else {
        showToast(`Authentication failed: ${result.error || 'Invalid token'}`, 'error');
        updateStatusBadge(false);
      }
    });
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

  // Test Connection & Save button
  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      const token = TokenSecurity.sanitizeToken(
        tokenInput.value || (await SecretsStorage.getToken()) || '',
      );
      const rawUrl = repoUrlInput.value;

      if (!token) {
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

      testConnBtn.disabled = true;
      testConnBtn.textContent = 'Validating & Testing...';

      const validator = new RepositoryValidator(token);
      const report = await validator.validateRepositoryScope(repoInfo.fullName);

      testConnBtn.disabled = false;
      testConnBtn.textContent = '🔍 Test Connection & Save';

      const defaultBranch = report.repoDetails?.defaultBranch || 'main';

      if (report.isValid) {
        const finalRepo = report.repoDetails?.fullName || repoInfo.fullName;
        await SecretsStorage.setToken(token);
        await SettingsStorage.saveSettings({
          selectedRepo: finalRepo,
          branch: defaultBranch,
        });

        repoUrlInput.value = `https://github.com/${finalRepo}`;
        showToast(
          `Connection verified! Target repository '${finalRepo}' (branch: ${defaultBranch}) configured successfully.`,
          'success',
        );
      } else {
        showToast(
          `Validation failed: ${report.errors[0] || 'Unable to access repository'}`,
          'error',
        );
      }

      renderDiagnosticReport(report, repoInfo.owner, repoInfo.repo, defaultBranch);
      updateStatusBadge(report.isValid);
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

  function renderDiagnosticReport(
    report: RepositoryValidationReport,
    owner: string,
    repo: string,
    branch: string,
  ): void {
    reportCard.style.display = 'block';
    reportContent.innerHTML = '';

    const displayOwner = report.repoDetails?.fullName
      ? report.repoDetails.fullName.split('/')[0]
      : owner;
    const displayRepo = report.repoDetails?.fullName
      ? report.repoDetails.fullName.split('/')[1]
      : repo;

    const statusHtml = `
      <div class="report-summary ${report.isValid ? 'success' : 'failure'}">
        <strong>${report.isValid ? 'GitHub Connected' : 'Validation Failed'}</strong>
      </div>
      <div class="report-details" style="margin: 12px 0;">
        <p><strong>Owner:</strong> ${SecurityValidation.escapeHtml(displayOwner)}</p>
        <p><strong>Repository:</strong> ${SecurityValidation.escapeHtml(displayRepo)}</p>
        <p><strong>Default Branch:</strong> ${SecurityValidation.escapeHtml(branch)}</p>
        <p><strong>Authentication:</strong> Fine-Grained PAT</p>
      </div>
      <ul class="report-checklist">
        <li class="${report.hasMetadataAccess ? 'pass' : 'fail'}">${report.hasMetadataAccess ? '✓' : '❌'} Metadata (Read)</li>
        <li class="${report.hasWritePermission ? 'pass' : 'fail'}">${report.hasWritePermission ? '✓' : '❌'} Contents (Read & Write)</li>
      </ul>
      <div class="report-status ${report.isValid ? 'pass' : 'fail'}" style="margin-top: 10px;">
        <strong>Status:</strong> ${report.isValid ? '✓ Ready' : '❌ Incomplete Configuration'}
      </div>
    `;

    let notesHtml = '';
    if (report.errors.length > 0) {
      notesHtml += `<div class="report-errors" style="margin-top: 10px;"><strong>Errors:</strong><ul>${report.errors.map((e) => `<li>${SecurityValidation.escapeHtml(e)}</li>`).join('')}</ul></div>`;
    }
    if (report.warnings.length > 0) {
      notesHtml += `<div class="report-warnings" style="margin-top: 10px;"><strong>Notes / Scope Info:</strong><ul>${report.warnings.map((w) => `<li>${SecurityValidation.escapeHtml(w)}</li>`).join('')}</ul></div>`;
    }

    reportContent.innerHTML = statusHtml + notesHtml;
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
