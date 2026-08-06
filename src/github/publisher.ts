import { AccountVerifiedPayload, ArchivePublishedPayload, EventBus } from '../core/events';
import { SecretsStorage } from '../storage/secrets';
import { SettingsStorage } from '../storage/settings';
import { APP_CONFIG } from '../core/config';
import { logger } from '../utils/logger';

/**
 * Safely encodes a string into Base64 format supporting UTF-8 Unicode characters.
 */
export function encodeBase64Utf8(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}

/**
 * Reads and logs non-2xx GitHub API response bodies for debugging.
 * For JSON responses, parses and logs message and documentation_url fields.
 * For non-JSON responses, logs raw response text. Never logs PAT or Authorization header.
 */
export async function parseAndLogGitHubApiError(
  response: Response,
  contextUrl: string,
): Promise<string> {
  const status = response.status;
  const statusText = response.statusText;
  let rawBody = '';

  try {
    rawBody = await response.text();
  } catch (err: unknown) {
    logger.warn(
      `[GitHubPublisher] Could not read error response body from HTTP ${status} for ${contextUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsedMessage = '';
  let docUrl = '';

  if (rawBody && rawBody.trim()) {
    try {
      const json = JSON.parse(rawBody);
      if (json && typeof json === 'object') {
        parsedMessage = json.message || '';
        docUrl = json.documentation_url || '';
      }
    } catch {
      // Raw non-JSON text response body
    }
  }

  if (parsedMessage) {
    let logStr = `[GitHubPublisher] GitHub API Non-2xx Response Body (HTTP ${status} ${statusText} for ${contextUrl}): message="${parsedMessage}"`;
    if (docUrl) {
      logStr += ` | documentation_url="${docUrl}"`;
    }
    logger.warn(logStr);
    return parsedMessage;
  }

  if (rawBody) {
    logger.warn(
      `[GitHubPublisher] GitHub API Non-2xx Response Body (HTTP ${status} ${statusText} for ${contextUrl}): ${rawBody}`,
    );
    return rawBody;
  }

  const defaultMsg = `HTTP ${status} ${statusText}`;
  logger.warn(
    `[GitHubPublisher] GitHub API Non-2xx Response Body (HTTP ${status} ${statusText} for ${contextUrl}): ${defaultMsg}`,
  );
  return defaultMsg;
}

/**
 * Service responsible for uploading verified solution archives to the user's configured GitHub repository.
 * Subscribes only to AccountVerified events. Has no dependency on LeetCode-specific logic.
 */
export class GitHubPublisher {
  private unsubscribe: (() => void) | null = null;
  private isListening: boolean = false;

  /**
   * Starts listening for AccountVerified events on the EventBus.
   */
  start(): void {
    if (this.isListening) {
      logger.info('[GitHubPublisher] Already listening for AccountVerified events.');
      return;
    }

    logger.info('[GitHubPublisher] Starting GitHub publisher listener...');
    this.isListening = true;

    this.unsubscribe = EventBus.getInstance().subscribe<AccountVerifiedPayload>(
      'AccountVerified',
      (event) => {
        logger.info('[GitHubPublisher] AccountVerified event callback triggered.');
        void this.publishArchive(event.payload).catch((err: unknown) => {
          logger.error(
            `[GitHubPublisher] Exception caught in publishArchive execution: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      },
    );
  }

  /**
   * Uploads virtual files from AccountVerified payload to GitHub repository using GitHub Contents API.
   */
  public async publishArchive(
    verifiedPayload: AccountVerifiedPayload,
  ): Promise<ArchivePublishedPayload | null> {
    logger.info('[GitHubPublisher] Beginning publishArchive execution...');
    logger.info('[GitHubPublisher] Loading repository configuration and settings...');

    const token = await SecretsStorage.getToken();
    logger.info(
      `[GitHubPublisher] PAT loaded: ${token ? 'Present (valid credential)' : 'Missing'}`,
    );

    const settings = await SettingsStorage.getSettings();
    logger.info(
      `[GitHubPublisher] Settings loaded. Selected repo: '${settings.selectedRepo || 'None'}', Configured branch: '${settings.branch || 'Auto-detect'}'`,
    );

    if (!token) {
      logger.warn('[GitHubPublisher] Aborted: GitHub Personal Access Token is missing.');
      return null;
    }

    if (!settings.selectedRepo) {
      logger.warn('[GitHubPublisher] Aborted: Target repository is not configured.');
      return null;
    }

    if (!verifiedPayload.username) {
      logger.warn('[GitHubPublisher] Aborted: Verified username missing in payload.');
      return null;
    }

    const repoFullName = settings.selectedRepo;
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) {
      logger.warn(`[GitHubPublisher] Aborted: Invalid repository format '${repoFullName}'.`);
      return null;
    }

    // Branch handling
    let targetBranch = settings.branch;
    if (!targetBranch || !targetBranch.trim()) {
      logger.info('[GitHubPublisher] No branch configured. Initiating default branch detection...');
      targetBranch = (await this.detectDefaultBranch(token, owner, repo)) || 'main';
      logger.info(`[GitHubPublisher] Default branch detected and set to: '${targetBranch}'`);
      if (targetBranch) {
        await SettingsStorage.saveSettings({ branch: targetBranch });
        logger.info(`[GitHubPublisher] Cached target branch '${targetBranch}' in SettingsStorage.`);
      }
    } else {
      logger.info(`[GitHubPublisher] Using target branch: '${targetBranch}'`);
    }

    const files = verifiedPayload.archive.files;
    if (!files || files.length === 0) {
      logger.warn('[GitHubPublisher] Aborted: No virtual files in archive payload.');
      return null;
    }

    let lastCommitSha = '';

    for (const file of files) {
      logger.info(`[GitHubPublisher] Initiating upload for file '${file.path}'...`);

      const uploadResult = await this.uploadFile(
        token,
        owner,
        repo,
        file.path,
        file.content,
        targetBranch,
        verifiedPayload.archive.problemTitle,
        verifiedPayload.archive.language,
      );

      if (!uploadResult.success) {
        logger.warn(`[GitHubPublisher] Upload failed for '${file.path}': ${uploadResult.error}`);
        return null;
      }

      if (uploadResult.commitSha) {
        lastCommitSha = uploadResult.commitSha;
      }
      logger.info(`[GitHubPublisher] File '${file.path}' uploaded successfully.`);
    }

    logger.info('[GitHubPublisher] Archive published successfully');

    const publishedPayload: ArchivePublishedPayload = {
      repository: repoFullName,
      branch: targetBranch,
      commitSha: lastCommitSha,
      committedFiles: files.length,
      publishedAt: Date.now(),
    };

    logger.info(
      `[GitHubPublisher] Publishing ArchivePublished event for repository '${repoFullName}'...`,
    );
    EventBus.getInstance().publish('ArchivePublished', publishedPayload);
    return publishedPayload;
  }

  /**
   * Queries GitHub API for repository default branch.
   */
  private async detectDefaultBranch(
    token: string,
    owner: string,
    repo: string,
  ): Promise<string | null> {
    const url = `${APP_CONFIG.githubApiBaseUrl}/repos/${owner}/${repo}`;
    logger.info(`[GitHubPublisher] GitHub API Request (GET): ${url}`);
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      logger.info(
        `[GitHubPublisher] GitHub API Response (GET ${url}): HTTP ${response.status} ${response.statusText}`,
      );

      if (response.ok) {
        const data = await response.json();
        return data.default_branch || 'main';
      }

      await parseAndLogGitHubApiError(response, url);
    } catch (err: unknown) {
      logger.error(
        `[GitHubPublisher] Exception caught in detectDefaultBranch: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }

  /**
   * Uploads a single virtual file using GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path}).
   */
  private async uploadFile(
    token: string,
    owner: string,
    repo: string,
    filePath: string,
    content: string,
    branch: string,
    problemTitle: string,
    language: string,
  ): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      const apiUrl = `${APP_CONFIG.githubApiBaseUrl}/repos/${owner}/${repo}/contents/${encodedPath}`;

      // 1. Retrieve existing file SHA if file already exists in repository
      let existingSha: string | undefined = undefined;
      const getUrl = `${apiUrl}?ref=${encodeURIComponent(branch)}`;
      logger.info(`[GitHubPublisher] GitHub API Request (GET contents): ${getUrl}`);
      const getResponse = await fetch(getUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      logger.info(
        `[GitHubPublisher] GitHub API Response (GET contents '${filePath}'): HTTP ${getResponse.status} ${getResponse.statusText}`,
      );

      if (getResponse.ok) {
        const existingData = await getResponse.json();
        existingSha = existingData.sha;
        logger.info(
          `[GitHubPublisher] Retrieved existing file SHA for '${filePath}': ${existingSha}`,
        );
      } else if (getResponse.status === 404) {
        // 404 is expected for new files
      } else {
        const apiError = await parseAndLogGitHubApiError(getResponse, getUrl);
        return {
          success: false,
          error: apiError,
        };
      }

      // 2. Put file content
      const base64Content = encodeBase64Utf8(content);
      const commitMessage = `Archive ${problemTitle} (${language}) [LeetArchive]`;

      const putBody: Record<string, unknown> = {
        message: commitMessage,
        content: base64Content,
        branch,
      };
      if (existingSha) {
        putBody.sha = existingSha;
      }

      logger.info(`[GitHubPublisher] GitHub API Request (PUT contents): ${apiUrl}`);
      const putResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(putBody),
      });

      logger.info(
        `[GitHubPublisher] GitHub API Response (PUT contents '${filePath}'): HTTP ${putResponse.status} ${putResponse.statusText}`,
      );

      if (putResponse.ok) {
        const putData = await putResponse.json();
        const commitSha = putData?.commit?.sha || putData?.content?.sha || '';
        return { success: true, commitSha };
      }

      const apiError = await parseAndLogGitHubApiError(putResponse, apiUrl);
      return { success: false, error: apiError };
    } catch (err: unknown) {
      logger.error(
        `[GitHubPublisher] Exception caught in uploadFile for '${filePath}': ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        success: false,
        error: `Network failure: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Stops listening for events and cleans up subscriptions.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isListening = false;
    logger.info('[GitHubPublisher] Stopped GitHub publisher listener.');
  }
}
