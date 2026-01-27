/**
 * Validates that a HackerRank URL contains an authkey query parameter.
 *
 * @param url - The HackerRank URL to validate
 * @returns true if the URL contains an authkey parameter, false otherwise
 *
 * @example
 * ```typescript
 * validateHackerRankUrl('https://www.hackerrank.com/work/tests/123/candidates/completed/456/report/summary?authkey=abc123')
 * // returns true
 *
 * validateHackerRankUrl('https://www.hackerrank.com/work/tests/123/candidates/completed/456/report/summary')
 * // returns false
 * ```
 */
export function validateHackerRankUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.has('authkey');
  } catch {
    // Invalid URL format
    return false;
  }
}
