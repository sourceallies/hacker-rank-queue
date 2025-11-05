import { ActionParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId, BlockId } from './enums';
import { userRepo } from '@repos/userRepo';
import { mention, textBlock } from '@utils/text';
import { reportErrorAndContinue } from '@utils/reportError';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { chatService } from '@/services/ChatService';
import { blockUtils } from '@utils/blocks';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { reviewLockManager } from '@utils/reviewLockManager';
import { lockedExecute } from '@utils/lockedExecute';

export const acceptReviewRequest = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('acceptReviewRequest.setup', 'Setting up acceptReviewRequest action handler');
    this.app = app;
    app.action(ActionId.REVIEWER_DM_ACCEPT, this.handleAccept.bind(this));
  },

  async handleAccept({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const user = body.user;
      const threadId = body.actions[0].value;
      if (!threadId) {
        throw new Error('No thread ID in action value');
      }

      if (!body.message) {
        throw new Error('No message exists on body - unable to accept review');
      }

      const messageTimestamp = body.message.ts;
      if (!messageTimestamp) {
        throw new Error('No timestamp on message');
      }

      log.d('acceptReviewRequest.handleAccept', `${user.name} accepted review ${threadId}`);

      // Use a per-threadId lock to prevent race conditions when multiple users accept simultaneously
      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        // Quick check: If user already responded, ignore duplicate clicks
        const existingReview = await activeReviewRepo.getReviewByThreadIdOrUndefined(threadId);

        // Review may have been closed by another concurrent accept/decline
        if (!existingReview) {
          log.d(
            'acceptReviewRequest.handleAccept',
            `Review ${threadId} no longer exists - likely closed by concurrent action`,
          );
          return;
        }

        const isPending = existingReview.pendingReviewers.some(r => r.userId === user.id);

        if (!isPending) {
          log.d(
            'acceptReviewRequest.handleAccept',
            `User ${user.id} already responded to review ${threadId}, ignoring duplicate click`,
          );
          return;
        }

        // Try to add user to accepted reviewers - this will throw if they're not in pending list
        // (race condition protection in case of simultaneous clicks)
        try {
          await addUserToAcceptedReviewers(user.id, threadId);
        } catch (err) {
          log.d(
            'acceptReviewRequest.handleAccept',
            `User ${user.id} already responded to review ${threadId} (race condition), ignoring duplicate click`,
          );
          return;
        }

        // remove accept/decline buttons from original message and update it
        const blocks = blockUtils.removeBlock(body, BlockId.REVIEWER_DM_BUTTONS);
        blocks.push(textBlock('*You accepted this review.*'));

        // Add HackerRank URL with instructions if available
        const review = await activeReviewRepo.getReviewByThreadIdOrUndefined(threadId);
        if (review) {
          blocks.push(
            textBlock(`*HackerRank Report:* <${review.hackerRankUrl}|View Candidate Assessment>`),
          );
          blocks.push(
            textBlock(
              '_To review the candidate\u2019s test, visit the URL above and log in with your Source Allies HackerRank account. If you have questions about using HackerRank\u2019s review features, please visit our <https://allies.atlassian.net/wiki/spaces/REI/pages/4868112402/Helpful+HackerRank+Features|documentation>._',
            ),
          );
          blocks.push(
            textBlock(
              `_Don't have a HackerRank account? Ping ${mention({ id: review.requestorId })} and they'll make one for you._`,
            ),
          );
          await chatService.updateDirectMessage(client, user.id, messageTimestamp, blocks);

          await userRepo.markNowAsLastReviewedDate(user.id);

          await chatService.replyToReviewThread(
            client,
            threadId,
            `${mention(user)} has agreed to review this submission.`,
          );

          await reviewCloser.closeReviewIfComplete(this.app, threadId);
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
