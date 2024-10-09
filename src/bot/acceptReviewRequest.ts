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
import {
  generateHackParserPresignedURL,
  HackParserIntegrationEnabled,
  listHackParserCodeKeys,
} from '@/services/HackParserService';

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

      // if HackParser integration is enabled, add link to the PDF and any code results that are found
      if (HackParserIntegrationEnabled()) {
        try {
          const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);
          if (review.pdfIdentifier) {
            blocks.push(
              textBlock(
                `HackerRank PDF: <${await generateHackParserPresignedURL(review.pdfIdentifier)}|${review.pdfIdentifier}>`,
              ),
            );

            const codeKeys = await listHackParserCodeKeys(review.pdfIdentifier);
            if (codeKeys.length) {
              blocks.push(textBlock(`Code results from above PDF via HackParser:`));
              for (const key of codeKeys) {
                blocks.push(
                  textBlock(
                    ` •  <${await generateHackParserPresignedURL(key)}|${key.split('/').slice(1).join('/')}>`,
                  ),
                );
              }
            }
          }
        } catch (err) {
          log.e('acceptReviewRequest.handleAccept', 'Error generating HackParser text blocks', err);
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
