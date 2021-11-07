import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { chatService } from '@/services/ChatService';
import { declineRequest } from '@/services/RequestService';
import { ActionParam } from '@/slackTypes';
import { blockUtils } from '@/utils/blocks';
import { reportErrorAndContinue } from '@/utils/reportError';
import { textBlock } from '@/utils/text';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId, BlockId } from './enums';

export const declineReviewRequest = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('declineReviewRequest.setup', 'Setting up declineReviewRequest action handler');
    this.app = app;
    app.action(ActionId.REVIEWER_DM_DECLINE, this.handleDecline.bind(this));
  },

  async handleDecline({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const user = body.user;
      const threadId = body.actions[0].value;

      const review = await activeReviewRepo.getReviewByThreadIdOrFail(threadId);

      await declineRequest(client, review, user.id);

      // remove accept/decline buttons from original message and update it
      const blocks = blockUtils.removeBlock(body, BlockId.REVIEWER_DM_BUTTONS);
      blocks.push(textBlock('You declined this review.'));
      await chatService.updateMessage(client, user.id, body, blocks);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Unknown error when accepting a review', {
        body,
      })(err as Error);
    }
  },
};
