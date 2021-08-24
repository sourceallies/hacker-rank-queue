export function containsAll<T>(arrayToCheck: T[], valuesIncluded: T[]): boolean {
  return valuesIncluded.every(expectedValue => arrayToCheck.indexOf(expectedValue) !== -1);
}
