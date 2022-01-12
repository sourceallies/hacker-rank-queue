import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { RequestService } from '@services';
import { App } from '@slack/bolt';
import log from '@utils/log';

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
      // fetch the review fresh from data store each iteration in case multiple reviewers expire on the same review at the same time
      const expiredReview = await activeReviewRepo.getReviewByThreadIdOrFail(review.threadId);

      log.d('reviewProcessor', `Expiring review ${review.threadId} for user ${reviewerId}`);

      await RequestService.expireRequest(app, expiredReview, reviewerId);
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
