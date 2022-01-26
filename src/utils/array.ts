/**
 * Returns true if there is any overlap between the two provided arrays.
 */
export function containsAny<T>(firstArray: T[], secondArray: T[]): boolean {
  return secondArray.some(expectedValue => firstArray.indexOf(expectedValue) !== -1);
}
