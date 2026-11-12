import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviews } from '@/services/ThreadRecords';
import { determineCloseTime, requestCloseBusinessDays } from '@utils/reviewExpirationUtils';
import { ActiveReview } from '@models/ActiveReview';
import { App } from '@slack/bolt';
import log from '@utils/log';

/**
 * Closes any review that hasn't filled within `REQUEST_CLOSE_BUSINESS_DAYS` business days of being
 * requested. The review's `dueBy` is deliberately ignored: we want quick turnaround either way.
 */
export async function closeTimedOutReviews(app: App): Promise<void> {
  const businessDays = requestCloseBusinessDays();
  const isTimedOut = (review: ActiveReview) =>
    review.acceptedReviewers.length < review.reviewersNeededCount &&
    Date.now() >= determineCloseTime(review.requestedAt, businessDays);

  const reviews = await activeReviewRepo.listAll();
  for (const review of reviews.filter(isTimedOut)) {
    try {
      // The review may have filled or closed since listAll(), so re-check against the fresh copy
      await activeReviews.withRecord(review.threadId, async freshReview => {
        if (!isTimedOut(freshReview)) return;
        log.d('closeTimedOutReviews', `Closing unfilled review ${review.threadId}`);
        await reviewCloser.closeUnfilledReviewAfterTimeout(app, freshReview, businessDays);
      });
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when closing a timed-out review', {
        review,
      })(err as Error);
    }
  }
}
