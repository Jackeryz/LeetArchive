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
 * Encodes a UTF-8 string into standard Base64 format supporting all Unicode characters.
 */
export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string back into a UTF-8 string supporting all Unicode characters.
 */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Legacy wrapper for backward compatibility.
 */
export function utf8ToBase64(str: string): string {
  return encodeBase64Utf8(str);
}

/**
 * Computes a fast deterministic short hash (hex) for safe logging and pipeline tracing
 * without exposing raw solution code or user credentials.
 */
export function hashContent(content: string): string {
  if (!content) return 'empty';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  return 'sha_' + hex.padStart(14, '0').slice(0, 10);
}

/**
 * Computes the official Git blob SHA-1 hex string for a given text content.
 * Matches Git object hashing: sha1("blob " + sizeInBytes + "\0" + contentBytes).
 */
export async function computeGitBlobSha(content: string): Promise<string> {
  const contentBytes = new TextEncoder().encode(content);
  const headerBytes = new TextEncoder().encode(`blob ${contentBytes.length}\0`);
  const full = new Uint8Array(headerBytes.length + contentBytes.length);
  full.set(headerBytes, 0);
  full.set(contentBytes, headerBytes.length);

  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.digest === 'function'
  ) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', full);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return 'unavailable';
}
