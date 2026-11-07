import { ActiveReview } from '@models/ActiveReview';
import { PairingSession } from '@models/PairingSession';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { lockedExecute } from '@utils/lockedExecute';
import log from '@utils/log';
import { Lock, LockInstance } from 'lock';

export interface ThreadRecords<R> {
  /**
   * Runs `change` against a fresh read of the thread's record while holding that thread's lock, so
   * nothing else using this module can read or write the record until `change` settles.
   *
   * Every handler and cron that reads-then-writes a record must go through here. A caller that
   * reads outside the lock can save a stale copy over someone else's write. That is the race #588
   * fixed for reviews.
   *
   * If the record is gone (closed by a concurrent action), `onGone` runs instead, still under the
   * lock. Without `onGone`, it logs and resolves to undefined.
   *
   * Not re-entrant: calling `withRecord` for the same thread from inside `change` deadlocks.
   */
  withRecord<T>(
    threadId: string,
    change: (record: R) => Promise<T>,
    onGone?: () => Promise<T>,
  ): Promise<T | undefined>;

  /** How many threads currently have a lock held or waited on. For tests and diagnostics. */
  lockedThreadCount(): number;
}

interface HeldLock {
  lock: LockInstance;
  holders: number;
}

export function threadRecords<R>(
  name: string,
  load: (threadId: string) => Promise<R | undefined>,
): ThreadRecords<R> {
  // A lock lives only while someone holds or waits on it, so closing a record needs no cleanup call.
  const locks = new Map<string, HeldLock>();

  return {
    async withRecord(threadId, change, onGone) {
      const held = locks.get(threadId) ?? { lock: Lock(), holders: 0 };
      held.holders++;
      locks.set(threadId, held);

      try {
        return await lockedExecute(held.lock, async () => {
          const record = await load(threadId);
          if (record) return change(record);

          if (onGone) return onGone();
          log.d(name, `${threadId} no longer exists - likely closed by a concurrent action`);
          return undefined;
        });
      } finally {
        if (--held.holders === 0) locks.delete(threadId);
      }
    },

    lockedThreadCount() {
      return locks.size;
    },
  };
}

// The arrow functions look the repo method up on every call, so tests that replace it still work.
export const activeReviews = threadRecords<ActiveReview>('activeReviews', threadId =>
  activeReviewRepo.getReviewByThreadIdOrUndefined(threadId),
);

export const pairingSessions = threadRecords<PairingSession>('pairingSessions', threadId =>
  pairingSessionsRepo.getByThreadIdOrUndefined(threadId),
);
