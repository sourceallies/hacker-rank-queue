import { Lock, LockInstance } from 'lock';

/**
 * Manages per-threadId locks to prevent race conditions when multiple reviewers
 * accept/decline the same review simultaneously.
 */
class ReviewLockManager {
  private locks: Map<string, LockInstance> = new Map();

  /**
   * Gets or creates a lock for the given threadId
   */
  getLock(threadId: string): LockInstance {
    if (!this.locks.has(threadId)) {
      this.locks.set(threadId, Lock());
    }
    return this.locks.get(threadId)!;
  }

  /**
   * Removes the lock for a threadId after review is closed.
   * Call this to prevent memory leaks from accumulating locks.
   */
  releaseLock(threadId: string): void {
    this.locks.delete(threadId);
  }
}

export const reviewLockManager = new ReviewLockManager();
