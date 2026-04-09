import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { RequestService } from '@services';
import { App } from '@slack/bolt';
import log from '@utils/log';

export async function expireRequests(app: App): Promise<void> {
  const reviews = await activeReviewRepo.listAll();
  const reviewsToExpand = reviews.filter(review => Date.now() > review.nextExpandAt);

  for (const review of reviewsToExpand) {
    try {
      log.d('expireRequests', `Expanding review ${review.threadId}`);
      await RequestService.expandRequest(app, review);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(
        app,
        'Unknown error when trying to expand review with additional reviewer',
        { review },
      )(err);
    }
  }
}
