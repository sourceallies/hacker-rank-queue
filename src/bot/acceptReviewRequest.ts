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

      await addUserToAcceptedReviewers(user.id, threadId);

      await userRepo.markNowAsLastReviewedDate(user.id);

      await chatService.replyToReviewThread(
        client,
        threadId,
        `${mention(user)} has agreed to review this HackerRank.`,
      );

      // remove accept/decline buttons from original message and update it
      const blocks = blockUtils.removeBlock(body, BlockId.REVIEWER_DM_BUTTONS);
      blocks.push(textBlock('You accepted this review.'));
      await chatService.updateMessage(client, user.id, body, blocks);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
