import { ActionId, BlockId } from '@bot/enums';
import { bold, compose, link, mention, ul } from '@utils/text';
import { ActionsBlock, Block } from '@slack/bolt';
import { SectionBlock } from '@slack/types';

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
      this.buildReviewSectionBlock(requestor, languages, deadlineDisplay),
      this.buildReviewActionsBlock(threadId),
    ];
  },

  buildReviewSectionBlock(
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
  ): SectionBlock {
    return {
      block_id: BlockId.REVIEWER_DM_CONTEXT,
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: compose(
          `${mention(requestor)} has requested a HackerRank done in the following languages:`,
          ul(...languages),
          bold(`The review is needed by: ${deadlineDisplay}`),
          link('Candidate Resume and Self Eval', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        ),
      },
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
