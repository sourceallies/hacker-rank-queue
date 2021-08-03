import { RequestService } from '@services';
import { App } from '@slack/bolt';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { ActiveReview } from '@/database/models/ActiveReview';

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
    const catchError = reportErrorAndContinue(
      app,
      'Unknown error when trying to notify a reviewer that their time has ran out',
      { review, reviewerId },
    );
    await RequestService.declineRequest(app.client, review, reviewerId).catch(catchError);
  }
}
