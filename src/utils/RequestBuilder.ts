import { ActionId, BlockId } from '@bot/enums';
import { bold, compose, mention, ul } from '@utils/text';
import { ActionsBlock, Block, ContextBlock } from '@slack/bolt';

export const requestBuilder = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  buildReviewRequest(
    reviewerId: string,
    threadId: string,
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
  ): any {
    return {
      channel: reviewerId,
      text: 'HackerRank review requested',
      blocks: this.buildReviewBlocks(threadId, requestor, languages, deadlineDisplay),
    };
  },

  buildReviewBlocks(
    threadId: string,
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
  ): Block[] {
    return [
      this.buildReviewContextBlock(requestor, languages, deadlineDisplay),
      this.buildReviewActionsBlock(threadId),
    ];
  },

  buildReviewContextBlock(
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
  ): ContextBlock {
    return {
      block_id: BlockId.REVIEWER_DM_CONTEXT,
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: compose(
            `${mention(requestor)} has requested a HackerRank done in the following languages:`,
            ul(...languages),
            bold(`The review is needed by: ${deadlineDisplay}`),
          ),
        },
      ],
    };
  },

  buildReviewActionsBlock(threadId: string): ActionsBlock {
    return {
      block_id: BlockId.REVIEWER_DM_BUTTONS,
      type: 'actions',
      elements: [
        {
          action_id: ActionId.REVIEWER_DM_ACCEPT,
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Accept',
          },
          style: 'primary',
          value: threadId,
        },
        {
          action_id: ActionId.REVIEWER_DM_DECLINE,
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Decline',
          },
          style: 'danger',
          value: threadId,
        },
      ],
    };
  },
};
