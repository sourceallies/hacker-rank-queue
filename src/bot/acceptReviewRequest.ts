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
import { generatePresignedUrl, getKeysWithinDirectory } from '@/utils/s3';
// import { generatePresignedUrl } from '@utils/s3';

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

      if (!body.message) {
        throw new Error('No message exists on body - unable to accept review');
      }

      log.d('acceptReviewRequest.handleAccept', `${user.name} accepted review ${threadId}`);

      // remove accept/decline buttons from original message and update it
      const blocks = blockUtils.removeBlock(body, BlockId.REVIEWER_DM_BUTTONS);
      blocks.push(textBlock('You accepted this review.'));

      // add PDF & HackParser code files if they exist to the message
      const review = await activeReviewRepo.getReviewByThreadId(threadId);
      if (review?.pdfIdentifier) {
        blocks.push(
          textBlock(
            `HackerRank PDF: <${await generatePresignedUrl(review.pdfIdentifier)}|${review.pdfIdentifier}>`,
          ),
        );

        const directoryKey = review.pdfIdentifier.replace(/\.pdf$/, '') + '/';
        const keys = await getKeysWithinDirectory(directoryKey);
        if (keys.length) {
          const lines = [`Code results from \`${review.pdfIdentifier}\` via HackParser:`, ''];
          for (const key of keys.filter(key => key !== directoryKey + 'results.json')) {
            lines.push(`- <${await generatePresignedUrl(key)}|${key.split(directoryKey)[1]}>`);
          }
          blocks.push(textBlock(lines.join('\n')));
        }
      }

      await chatService.updateDirectMessage(client, user.id, body.message.ts, blocks);

      await addUserToAcceptedReviewers(user.id, threadId);

      await userRepo.markNowAsLastReviewedDate(user.id);

      await chatService.replyToReviewThread(
        client,
        threadId,
        `${mention(user)} has agreed to review this submission.`,
      );

      await reviewCloser.closeReviewIfComplete(this.app, threadId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
