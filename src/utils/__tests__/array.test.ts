import { containsAny } from '@utils/array';

describe('Array', () => {
  describe('containsAny', () => {
    it('should return true if both arrays are identical', () => {
      const first = ['A', 'B', 'C'];
      const second = ['A', 'B', 'C'];
      expect(containsAny(first, second)).toBeTruthy();
    });

    it('should return true if the arrays contain a single match', () => {
      const first = ['A', 'B', 'C'];
      const second = ['C', 'D'];
      expect(containsAny(first, second)).toBeTruthy();
    });

    it('should return false if there are no matches', () => {
      const first = ['A', 'B', 'C'];
      const second = ['D', 'E', 'F'];
      expect(containsAny(first, second)).toBeFalsy();
    });

    it('should return false for two empty arrays', () => {
      expect(containsAny([], [])).toBeFalsy();
    });

    it('should return false if the first array has no values', () => {
      const first: string[] = [];
      const second = ['A', 'B', 'C'];
      expect(containsAny(first, second)).toBeFalsy();
    });

    it('should return false if the second array has no values', () => {
      const first = ['A', 'B', 'C'];
      const second: string[] = [];
      expect(containsAny(first, second)).toBeFalsy();
    });
  });
});
