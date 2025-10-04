import { LockInstance } from 'lock';

/**
 * Only allow a single execution of the function at a time. If another call is made while the
 * executor function is being ran, it is blocked until the previous call is completed.
 *
 * @example
 * import { Lock } from 'lock';
 * const lock = Lock();
 *
 * function executeOneAtATime() {
 *   await lockedExecute(lock, async () => {
 *     console.log("started");
 *     await sleep(2000);
 *     console.log("stopped");
 *   });
 * }
 * executeOneAtATime();
 * executeOneAtATime();
 *
 * // Output:
 * //   started
 * //   stopped
 * //   started
 * //   stopped
 *
 * @param lock The instance of the lock to use. Each different executor should have it's own separate lock
 * @param executor The function to be ran once at a time
 * @returns The value returned by the `executor`
 */
export function lockedExecute<T, S extends () => Promise<T>>(
  lock: LockInstance,
  executor: S,
): Promise<T> {
  return new Promise<T>((res, rej) => {
    lock('lockedExecute', unlock => {
      const unlockIt = unlock();
      executor().then(res).catch(rej).finally(unlockIt);
    });
  });
}
