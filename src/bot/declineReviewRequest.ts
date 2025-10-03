import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { declineRequest } from '@/services/RequestService';
import { ActionParam } from '@/slackTypes';
import { reportErrorAndContinue } from '@/utils/reportError';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId } from './enums';

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

      const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);

      log.d('declineReviewRequest.handleDecline', `${user.name} declined review ${threadId}`);

      // Idempotency check: If user already responded to this review, ignore duplicate clicks
      const alreadyAccepted = review.acceptedReviewers.some(r => r.userId === user.id);
      const alreadyDeclined = review.declinedReviewers.some(r => r.userId === user.id);

      if (alreadyAccepted || alreadyDeclined) {
        log.d(
          'declineReviewRequest.handleDecline',
          `User ${user.id} already responded to review ${threadId}, ignoring duplicate click`,
        );
        return;
      }

      await declineRequest(this.app, review, user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
