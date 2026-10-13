import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { RequestService } from '@services';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { lockedExecute } from '@utils/lockedExecute';
import { reviewLockManager } from '@utils/reviewLockManager';

interface ExpiredRequest {
  review: ActiveReview;
  reviewerId: string;
}

export async function expireRequests(app: App): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const expiredReviews = reviews.flatMap((review): ExpiredRequest[] =>
    review.pendingReviewers
      .filter(({ expiresAt }) => Date.now() > expiresAt)
      .map(({ userId }) => ({ review, reviewerId: userId })),
  );

  for (const { review, reviewerId } of expiredReviews) {
    try {
      // Same per-threadId lock as accept/decline, so an accept can't land mid-expire and get overwritten
      await lockedExecute(reviewLockManager.getLock(review.threadId), async () => {
        // fetch the review fresh inside the lock - it may have changed since listAll()
        const expiredReview = await activeReviewRepo.getReviewByThreadIdOrUndefined(
          review.threadId,
        );
        const stillExpired = expiredReview?.pendingReviewers.some(
          ({ userId, expiresAt }) => userId === reviewerId && Date.now() > expiresAt,
        );
        if (!expiredReview || !stillExpired) {
          log.d(
            'reviewProcessor',
            `Skipping expiration of review ${review.threadId} for user ${reviewerId} - no longer pending`,
          );
          return;
        }

        log.d('reviewProcessor', `Expiring review ${review.threadId} for user ${reviewerId}`);

        await RequestService.expireRequest(app, expiredReview, reviewerId);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(
        app,
        'Unknown error when trying to notify a reviewer that their time has ran out',
        { review, reviewerId },
      )(err);
    }
  }
}
