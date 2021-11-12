import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { mention } from '@/utils/text';
import { App } from '@slack/bolt';
import { chatService } from '@/services/ChatService';
import { ActiveReview } from '@models/ActiveReview';

function getCompletedReviews(reviews: ActiveReview[]) {
  return reviews.filter(
    ({ acceptedReviewers, reviewersNeededCount }) =>
      acceptedReviewers.length >= reviewersNeededCount,
  );
}

function getUnfulfilledReviews(reviews: ActiveReview[]) {
  return reviews.filter(({ pendingReviewers, acceptedReviewers, reviewersNeededCount }) => {
    return acceptedReviewers.length !== reviewersNeededCount && pendingReviewers.length == 0;
  });
}

async function closeReviews(
  app: App,
  reviews: ActiveReview[],
  getReviewMessage: (review: ActiveReview) => string,
): Promise<void> {
  for (const review of reviews) {
    try {
      await chatService.replyToReviewThread(app.client, review.threadId, getReviewMessage(review));
      await activeReviewRepo.remove(review.threadId);
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when closing a review', {
        review,
      })(err as Error);
    }
  }
}

export async function reviewCloser(app: App): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const completedReviews = getCompletedReviews(reviews);
  const unfulfilledReviews = getUnfulfilledReviews(reviews);

  await closeReviews(app, completedReviews, (review: ActiveReview) => {
    return `${mention({ id: review.requestorId })} all ${
      review.reviewersNeededCount
    } reviewers have been found!`;
  });
  await closeReviews(app, unfulfilledReviews, (review: ActiveReview) => {
    return `${mention({ id: review.requestorId })} ${review.acceptedReviewers.length} of ${
      review.reviewersNeededCount
    } needed reviewers found. No more potential reviewers are available.`;
  });
}
