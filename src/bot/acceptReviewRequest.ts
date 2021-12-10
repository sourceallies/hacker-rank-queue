import { ActionParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId, BlockId } from './enums';
import { userRepo } from '@repos/userRepo';
import { compose, link, mention, textBlock } from '@utils/text';
import { reportErrorAndContinue } from '@utils/reportError';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { chatService } from '@/services/ChatService';
import { blockUtils } from '@utils/blocks';
import { KnownBlock } from '@slack/types';
import { activeReviewRepo } from '@repos/activeReviewsRepo';

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
      // remove accept/decline buttons from original message and update it
      const blocks = blockUtils.removeBlock(body, BlockId.REVIEWER_DM_BUTTONS);
      blocks.push(textBlock('You accepted this review.'));
      await chatService.updateDirectMessage(client, user.id, body.message.ts, blocks);

      const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);
      const acceptMessageBlocks: KnownBlock[] = [
        {
          block_id: 'accepted-review-block',
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: compose(
              `Thank you for taking the time to review this HackerRank!`,
              link(review.hackerRankUrl, "View the candidate's results"),
              `After you have reviewed the information given on the candidate, please provide your feedback through ${link(
                process.env.FEEDBACK_FORM_URL as string,
                'this form',
              )}`,
            ),
          },
        },
      ];

      await chatService.postBlocksMessage(client, user.id, acceptMessageBlocks);

      await addUserToAcceptedReviewers(user.id, threadId);

      await userRepo.markNowAsLastReviewedDate(user.id);

      await chatService.replyToReviewThread(
        client,
        threadId,
        `${mention(user)} has agreed to review this HackerRank.`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
