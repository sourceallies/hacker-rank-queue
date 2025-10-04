import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { declineRequest } from '@/services/RequestService';
import { ActionParam } from '@/slackTypes';
import { reportErrorAndContinue } from '@/utils/reportError';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId } from './enums';
import { reviewLockManager } from '@utils/reviewLockManager';
import { lockedExecute } from '@utils/lockedExecute';

export const declineReviewRequest = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('declineReviewRequest.setup', 'Setting up declineReviewRequest action handler');
    this.app = app;
    app.action(ActionId.REVIEWER_DM_DECLINE, this.handleDecline.bind(this));
  },

  async handleDecline({ ack, body }: ActionParam): Promise<void> {
    await ack();

    try {
      const user = body.user;
      const threadId = body.actions[0].value;

      log.d('declineReviewRequest.handleDecline', `${user.name} declined review ${threadId}`);

      // Use a per-threadId lock to prevent race conditions when multiple users decline simultaneously
      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const review = await activeReviewRepo.getReviewByThreadIdOrUndefined(threadId);

        // Review may have been closed by another concurrent accept/decline
        if (!review) {
          log.d(
            'declineReviewRequest.handleDecline',
            `Review ${threadId} no longer exists - likely closed by concurrent action`,
          );
          return;
        }

        // Check if user is in pending list - if not, they already responded
        const isPending = review.pendingReviewers.some(r => r.userId === user.id);
        if (!isPending) {
          log.d(
            'declineReviewRequest.handleDecline',
            `User ${user.id} already responded to review ${threadId}, ignoring duplicate click`,
          );
          return;
        }

        // declineRequest will throw if user is not in pending (race condition protection)
        try {
          await declineRequest(this.app, review, user.id);
        } catch (err) {
          log.d(
            'declineReviewRequest.handleDecline',
            `User ${user.id} already responded to review ${threadId} (race condition), ignoring duplicate click`,
          );
          return;
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
