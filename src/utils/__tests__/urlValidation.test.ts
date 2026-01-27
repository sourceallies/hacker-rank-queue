import { validateHackerRankUrl } from '../urlValidation';

describe('validateHackerRankUrl', () => {
  it('should return true for a valid HackerRank URL with authkey', () => {
    const validUrl =
      'https://www.hackerrank.com/work/tests/123/candidates/completed/456/report/summary?authkey=789';
    expect(validateHackerRankUrl(validUrl)).toBe(true);
  });

  it('should return false for a HackerRank URL without authkey', () => {
    const invalidUrl =
      'https://www.hackerrank.com/work/tests/123/candidates/completed/456/report/summary';
    expect(validateHackerRankUrl(invalidUrl)).toBe(false);
  });

  it('should return true for a URL with authkey and other query parameters', () => {
    const validUrl =
      'https://www.hackerrank.com/work/tests/123/candidates/completed/456/report/summary?foo=bar&authkey=abc123&baz=qux';
    expect(validateHackerRankUrl(validUrl)).toBe(true);
  });

  it('should return false for an invalid URL format', () => {
    const invalidUrl = 'not-a-valid-url';
    expect(validateHackerRankUrl(invalidUrl)).toBe(false);
  });

  it('should return false for an empty string', () => {
    expect(validateHackerRankUrl('')).toBe(false);
  });

  it('should return false for a URL with authkey in the path but not as a query parameter', () => {
    const invalidUrl = 'https://www.hackerrank.com/work/tests/authkey/123/report';
    expect(validateHackerRankUrl(invalidUrl)).toBe(false);
  });

  it('should return true for a URL with authkey as an empty value', () => {
    // Even with an empty value, the parameter exists
    const validUrl = 'https://www.hackerrank.com/work/tests/123/report?authkey=';
    expect(validateHackerRankUrl(validUrl)).toBe(true);
  });
});
