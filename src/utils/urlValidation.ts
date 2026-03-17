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

/**
 * Validates that a Yardstick URL contains the required query parameters.
 *
 * Expected format:
 * https://script.google.com/a/sourceallies.com/macros/s/.../exec?page=hackerrank&candidate=<name>&zohoId=<id>
 *
 * Required query parameters:
 * - `page` must equal `hackerrank`
 * - `candidate` must be present and non-empty
 * - `zohoId` must be present and non-empty
 */
export function validateYardstickUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const page = urlObj.searchParams.get('page');
    const candidate = urlObj.searchParams.get('candidate');
    const zohoId = urlObj.searchParams.get('zohoId');
    return page === 'hackerrank' && !!candidate && !!zohoId;
  } catch {
    // Invalid URL format
    return false;
  }
}
