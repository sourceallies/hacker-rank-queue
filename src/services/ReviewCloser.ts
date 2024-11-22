import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { mention } from '@/utils/text';
import { App } from '@slack/bolt';
import { chatService } from '@/services/ChatService';
import { ActiveReview } from '@models/ActiveReview';
import { closeRequest } from '@/services/RequestService';

export const reviewCloser = {
  async closeReviewIfComplete(app: App, threadId: string): Promise<void> {
    const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);

    if (isCompleted(review)) {
      for (const user of review.pendingReviewers) {
        await closeRequest(app, review, user.userId);
      }
      await closeReview(
        app,
        review,
        `${mention({ id: review.requestorId })} all ${
          review.reviewersNeededCount
        } reviewers have been found!`,
      );
    } else if (isUnfulfilled(review)) {
      await closeReview(
        app,
        review,
        `${mention({ id: review.requestorId })} ${review.acceptedReviewers.length} of ${
          review.reviewersNeededCount
        } needed reviewers found. No more potential reviewers are available.`,
      );
    }
  },
};

function isCompleted(review: ActiveReview): boolean {
  return review.acceptedReviewers.length >= review.reviewersNeededCount;
}

function isUnfulfilled(review: ActiveReview): boolean {
  return (
    review.acceptedReviewers.length !== review.reviewersNeededCount &&
    review.pendingReviewers.length == 0
  );
}

async function closeReview(app: App, review: ActiveReview, msg: string): Promise<void> {
  try {
    await chatService.replyToReviewThread(app.client, review.threadId, msg);
    await activeReviewRepo.remove(review.threadId);
  } catch (err) {
    await reportErrorAndContinue(app, 'Unknown error when closing a review', {
      review,
    })(err as Error);
  }
}
