import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { sendWave } from '@/services/RequestService';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviews } from '@/services/ThreadRecords';
import { waveIntervalMs, waveSize } from '@utils/waveSettings';
import { ActiveReview } from '@models/ActiveReview';
import { App } from '@slack/bolt';
import log from '@utils/log';

/**
 * Offers each open review to the next wave of teammates once its newest offer is at least
 * `WAVE_INTERVAL_MIN` old. Offers are never taken back; the review keeps growing until it fills,
 * runs out of people, or times out (`closeTimedOutReviews`).
 */
export async function sendReviewWaves(app: App): Promise<void> {
  const size = waveSize();
  const interval = waveIntervalMs();
  const isWaveDue = (review: ActiveReview) => Date.now() - newestOfferAt(review) >= interval;

  const reviews = await activeReviewRepo.listAll();
  for (const review of reviews.filter(isWaveDue)) {
    try {
      // An accept, decline or another wave may have landed since listAll(), so re-check
      await activeReviews.withRecord(review.threadId, async freshReview => {
        if (!isWaveDue(freshReview)) return;
        const sent = await sendWave(app, freshReview, size);
        log.d('sendReviewWaves', `Sent a wave of ${sent} for review ${review.threadId}`);
        await reviewCloser.closeReviewIfComplete(app, freshReview.threadId);
      });
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when sending a wave of review offers', {
        review,
      })(err as Error);
    }
  }
}

/** With nobody pending, nobody is being asked, so a wave is due straight away. */
function newestOfferAt(review: ActiveReview): number {
  return Math.max(0, ...review.pendingReviewers.map(({ offeredAt }) => offeredAt));
}
