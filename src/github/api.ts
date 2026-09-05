import { APP_CONFIG } from '../core/config';
import { logger } from '../utils/logger';

export interface ApiResponse<T> {
  data: T | null;
  status: number;
  scopesHeader: string | null;
  errorMessage?: string;
  errorDetails?: unknown;
}

/**
 * Low-level HTTP fetch client for GitHub REST API calls.
 */
export class GitHubApiBase {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  public getToken(): string {
    return this.token;
  }

  public async fetchApi<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 15000,
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${APP_CONFIG.githubApiBaseUrl}${endpoint}`;

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');

    logger.debug(`GitHub API Request: ${options.method || 'GET'} ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const scopesHeader = response.headers.get('x-oauth-scopes');
      const status = response.status;

      if (!response.ok) {
        let errJson: unknown = null;
        try {
          errJson = await response.json();
        } catch {
          // Response was not JSON
        }

        const rawMessage =
          typeof errJson === 'object' && errJson !== null && 'message' in errJson
            ? String((errJson as { message?: unknown }).message)
            : undefined;
        let errorMessage: string;

        if (status === 401) {
          errorMessage =
            'Authentication failed: Personal Access Token is invalid, expired, or revoked.';
        } else if (status === 403) {
          errorMessage = rawMessage?.includes('rate limit')
            ? 'GitHub API rate limit exceeded. Please try again later.'
            : 'Access forbidden: Token lacks required permissions for this action.';
        } else if (status === 404) {
          errorMessage = 'Resource or repository not found, or token is not granted access to it.';
        } else if (status === 422) {
          errorMessage = rawMessage || 'Unprocessable request: Invalid parameters provided.';
        } else if (status === 429) {
          errorMessage = 'Rate limit exceeded: Too many requests. Please wait and try again.';
        } else if (status >= 500) {
          errorMessage =
            'GitHub API service error: Temporary server issue. Please try again later.';
        } else {
          errorMessage = rawMessage || `HTTP error ${status}: ${response.statusText}`;
        }

        logger.warn(
          `GitHub API Request failed: ${options.method || 'GET'} ${url} -> ${status} ${errorMessage}`,
        );
        return {
          data: null,
          status,
          scopesHeader,
          errorMessage,
          errorDetails: errJson,
        };
      }

      // Handle 204 No Content
      if (status === 204) {
        return {
          data: null,
          status,
          scopesHeader,
        };
      }

      const data = (await response.json()) as T;
      return {
        data,
        status,
        scopesHeader,
      };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? `Request timed out after ${timeoutMs / 1000} seconds.`
        : err instanceof Error
          ? err.message
          : String(err);

      const userFriendly = isAbort
        ? 'Network request timed out. Please check your internet connection.'
        : `Network failure: Unable to reach GitHub (${msg}).`;

      logger.error(`Network or fetch exception for ${url}: ${msg}`);
      return {
        data: null,
        status: 0,
        scopesHeader: null,
        errorMessage: userFriendly,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
