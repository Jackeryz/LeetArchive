import { SettingsStorage } from '../storage/settings';
import { SecretsStorage } from '../storage/secrets';
import { TokenSecurity } from '../security/token';
import { logger } from '../utils/logger';

document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Initializing LeetArchive Popup...');

  const optionsBtn = document.getElementById('open-options');
  const statusBadge = document.getElementById('status-badge');
  const userTokenMaskEl = document.getElementById('user-token-mask');
  const repoNameEl = document.getElementById('repo-name');

  const settings = await SettingsStorage.getSettings();
  const token = await SecretsStorage.getToken();

  if (token && TokenSecurity.isValidTokenFormat(token)) {
    if (statusBadge && settings.selectedRepo) {
      statusBadge.textContent = 'Configured';
      statusBadge.className = 'badge connected';
    } else if (statusBadge) {
      statusBadge.textContent = 'Repo Pending';
      statusBadge.className = 'badge pending';
    }
    if (userTokenMaskEl) {
      userTokenMaskEl.textContent = `Token: ${TokenSecurity.maskToken(token)}`;
    }
  }

  if (settings.selectedRepo && repoNameEl) {
    repoNameEl.textContent = `Target: ${settings.selectedRepo}`;
  }

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }
});
