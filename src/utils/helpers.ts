import { LANGUAGE_EXTENSION_MAP } from './constants';

/**
 * Converts a string to a clean URL/file-system slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
}

/**
 * Returns file extension for a given LeetCode programming language name.
 */
export function getFileExtension(language: string): string {
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_EXTENSION_MAP[normalized] || 'txt';
}

/**
 * Formats a problem title and ID into a zero-padded folder name (e.g., "0001-two-sum").
 */
export function formatProblemFolderName(id: string, title: string): string {
  const paddedId = id.padStart(4, '0');
  const slug = slugify(title);
  return `${paddedId}-${slug}`;
}

/**
 * Encodes a UTF-8 string to base64 for GitHub API uploads.
 */
export function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
