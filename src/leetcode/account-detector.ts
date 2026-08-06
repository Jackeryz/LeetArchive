import { logger } from '../utils/logger';

const GENERIC_KEYWORDS = new Set([
  'login',
  'signup',
  'problems',
  'submissions',
  'discuss',
  'contest',
  'explore',
  'store',
  'developer',
  'api',
  'settings',
  'support',
  'logout',
  'account',
  'profile',
]);

/**
 * Service responsible for automatically detecting the currently logged-in LeetCode account username
 * using a 4-stage layered, semantic detection strategy.
 */
export class LeetCodeAccountDetector {
  /**
   * Detects currently logged-in LeetCode username from DOM, window object, or HTML text.
   */
  public static detectCurrentAccount(doc?: Document | string): string | null {
    if (typeof doc === 'string') {
      return this.detectFromHtmlString(doc);
    }

    const documentObj = doc || (typeof document !== 'undefined' ? document : null);

    // Strategy 1: Window object / __NEXT_DATA__
    const fromWindow = this.detectFromWindow();
    if (fromWindow) {
      logger.debug(
        `[LeetCodeAccountDetector] Strategy 1 (Window object) detected username: '${fromWindow}'`,
      );
      return fromWindow;
    }

    if (!documentObj) return null;

    // Strategy 1b: __NEXT_DATA__ script tag
    const fromScript = this.detectFromScriptTag(documentObj);
    if (fromScript) {
      logger.debug(
        `[LeetCodeAccountDetector] Strategy 1b (Script tag) detected username: '${fromScript}'`,
      );
      return fromScript;
    }

    // Strategy 2: Semantic Meta tags
    const fromMeta = this.detectFromMetaTags(documentObj);
    if (fromMeta) {
      logger.debug(
        `[LeetCodeAccountDetector] Strategy 2 (Meta tags) detected username: '${fromMeta}'`,
      );
      return fromMeta;
    }

    // Strategy 3: Accessible Navigation / Profile Links
    const fromNav = this.detectFromNavigation(documentObj);
    if (fromNav) {
      logger.debug(
        `[LeetCodeAccountDetector] Strategy 3 (Navigation links) detected username: '${fromNav}'`,
      );
      return fromNav;
    }

    // Strategy 4: Resilient DOM Regex Fallback
    const fromDomFallback = this.detectFromDomFallback(documentObj);
    if (fromDomFallback) {
      logger.debug(
        `[LeetCodeAccountDetector] Strategy 4 (DOM Fallback) detected username: '${fromDomFallback}'`,
      );
      return fromDomFallback;
    }

    logger.debug('[LeetCodeAccountDetector] Could not detect logged-in LeetCode username.');
    return null;
  }

  /**
   * Strategy 1: Inspects window global objects (e.g. __NEXT_DATA__).
   */
  private static detectFromWindow(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      const win = window as unknown as {
        __NEXT_DATA__?: {
          props?: { pageProps?: { userStatus?: { username?: string; isSignedIn?: boolean } } };
        };
        userStatus?: { username?: string; isSignedIn?: boolean };
        pageData?: { userStatus?: { username?: string } };
      };
      const userStatus = win.__NEXT_DATA__?.props?.pageProps?.userStatus || win.userStatus;
      if (userStatus?.isSignedIn && userStatus?.username) {
        return this.cleanAndValidateUsername(userStatus.username);
      }
      if (win.pageData?.userStatus?.username) {
        return this.cleanAndValidateUsername(win.pageData.userStatus.username);
      }
    } catch (err: unknown) {
      logger.debug('[LeetCodeAccountDetector] Error inspecting window object:', err);
    }
    return null;
  }

  /**
   * Strategy 1b: Inspects __NEXT_DATA__ script tag content in DOM.
   */
  private static detectFromScriptTag(doc: Document): string | null {
    try {
      const script = doc.querySelector('script#__NEXT_DATA__');
      if (script && script.textContent) {
        const json = JSON.parse(script.textContent);
        const userStatus = json?.props?.pageProps?.userStatus;
        if (userStatus?.isSignedIn && userStatus?.username) {
          return this.cleanAndValidateUsername(userStatus.username);
        }
      }
    } catch (err: unknown) {
      logger.debug('[LeetCodeAccountDetector] Error parsing __NEXT_DATA__ script tag:', err);
    }
    return null;
  }

  /**
   * Strategy 2: Inspects semantic meta tags.
   */
  private static detectFromMetaTags(doc: Document): string | null {
    const metaSelectors = [
      'meta[name="user"]',
      'meta[name="username"]',
      'meta[property="og:title"]',
      'meta[name="author"]',
    ];

    for (const selector of metaSelectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const content = el.getAttribute('content');
        const validated = this.cleanAndValidateUsername(content);
        if (validated) return validated;
      }
    }
    return null;
  }

  /**
   * Strategy 3: Inspects semantic navigation / profile link elements.
   */
  private static detectFromNavigation(doc: Document): string | null {
    const navSelectors = [
      'header a[href*="/u/"]',
      'nav a[href*="/u/"]',
      '[role="navigation"] a[href*="/u/"]',
      'a[href^="/u/"]',
      'a[href^="/profile/"]',
      'a[aria-label*="profile" i]',
    ];

    const links = doc.querySelectorAll(navSelectors.join(', '));
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href') || '';
      const username = this.extractUsernameFromHref(href);
      if (username) return username;
    }

    return null;
  }

  /**
   * Strategy 4: Resilient DOM regex fallback.
   */
  private static detectFromDomFallback(doc: Document): string | null {
    const links = doc.querySelectorAll('a[href]');
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href') || '';
      const username = this.extractUsernameFromHref(href);
      if (username) return username;
    }
    return null;
  }

  /**
   * Helper for HTML string detection (e.g. from fetch).
   */
  private static detectFromHtmlString(html: string): string | null {
    const nextDataMatch = html.match(/"userStatus":\s*\{[^}]*"username":\s*"([^"]+)"/);
    if (nextDataMatch && nextDataMatch[1]) {
      const validated = this.cleanAndValidateUsername(nextDataMatch[1]);
      if (validated) return validated;
    }

    const profileMatch = html.match(/\/(?:u|profile)\/([a-zA-Z0-9_-]+)/);
    if (profileMatch && profileMatch[1]) {
      const validated = this.cleanAndValidateUsername(profileMatch[1]);
      if (validated) return validated;
    }

    return null;
  }

  /**
   * Extracts username from href pattern like /u/username/ or /profile/username/.
   */
  private static extractUsernameFromHref(href: string): string | null {
    if (!href) return null;
    const match = href.match(/\/(?:u|profile)\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return this.cleanAndValidateUsername(match[1]);
    }
    return null;
  }

  /**
   * Cleans and validates raw username string.
   */
  public static cleanAndValidateUsername(raw: string | null): string | null {
    if (!raw) return null;
    const cleaned = raw.trim();
    if (!cleaned) return null;

    const lower = cleaned.toLowerCase();
    if (GENERIC_KEYWORDS.has(lower)) return null;

    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(cleaned)) return null;

    return cleaned;
  }

  /**
   * Async detection helper for options onboarding page (queries GraphQL or page fetch).
   */
  public static async detectFromLeetCodeSite(): Promise<string | null> {
    try {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query userStatus { userStatus { username isSignedIn } }',
        }),
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        const userStatus = json?.data?.userStatus;
        if (userStatus?.isSignedIn && userStatus?.username) {
          return this.cleanAndValidateUsername(userStatus.username);
        }
      }
    } catch (err: unknown) {
      logger.debug('[LeetCodeAccountDetector] GraphQL userStatus fetch failed:', err);
    }

    try {
      const pageRes = await fetch('https://leetcode.com/', { credentials: 'include' });
      if (pageRes.ok) {
        const html = await pageRes.text();
        return this.detectCurrentAccount(html);
      }
    } catch (err: unknown) {
      logger.debug('[LeetCodeAccountDetector] LeetCode main page fetch failed:', err);
    }

    return null;
  }
}
