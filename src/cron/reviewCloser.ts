import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { mention } from '@/utils/text';
import { App } from '@slack/bolt';

export async function reviewCloser(app: App): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const completedReviews = reviews.filter(
    ({ acceptedReviewers, reviewersNeededCount }) =>
      acceptedReviewers.length >= reviewersNeededCount,
  );

  for (const review of completedReviews) {
    const requestor = { id: review.requestorId };

    try {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        thread_ts: review.threadId,
        channel: process.env.INTERVIEWING_CHANNEL_ID,
        text: `${mention(requestor)} all ${review.reviewersNeededCount} reviewers have been found!`,
      });

      await activeReviewRepo.remove(review.threadId);
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when closing a review', {
        review,
      })(err as Error);
    }
  }
}
