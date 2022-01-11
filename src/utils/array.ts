/**
 * Returns true if there are the provided number of matches between the two provided arrays.
 */
export function containsMatches<T>(
  arrayToCheck: T[],
  valuesIncluded: T[],
  numberOfMatches: number,
): boolean {
  return (
    valuesIncluded.filter(expectedValue => arrayToCheck.includes(expectedValue)).length ==
    numberOfMatches
  );
}
