import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { RequestService } from '@services';
import { App } from '@slack/bolt';

interface ExpiredRequest {
  review: ActiveReview;
  reviewerId: string;
}

export async function reviewProcessor(app: App): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const expiredReviews = reviews.flatMap((review): ExpiredRequest[] =>
    review.pendingReviewers
      .filter(({ expiresAt }) => Date.now() > expiresAt)
      .map(({ userId }) => ({ review, reviewerId: userId })),
  );

  for (const { review, reviewerId } of expiredReviews) {
    try {
      await RequestService.expireRequest(app.client, review, reviewerId);
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
