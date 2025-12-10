import { ActionId, BlockId } from '@bot/enums';
import { bold, compose, mention, ul } from '@utils/text';
import { ActionsBlock, Block, SectionBlock } from '@slack/types';

export const requestBuilder = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  buildReviewRequest(
    reviewerId: string,
    threadId: string,
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
    candidateTypeDisplay: string,
  ): any {
    return {
      channel: reviewerId,
      text: `HackerRank review requested`,
      blocks: this.buildReviewBlocks(
        threadId,
        requestor,
        languages,
        deadlineDisplay,
        candidateTypeDisplay,
      ),
    };
  },

  buildReviewBlocks(
    threadId: string,
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
    candidateTypeDisplay: string,
  ): Block[] {
    return [
      this.buildReviewSectionBlock(requestor, languages, deadlineDisplay, candidateTypeDisplay),
      this.buildReviewActionsBlock(threadId),
    ];
  },

  buildReviewSectionBlock(
    requestor: { id: string },
    languages: string[],
    deadlineDisplay: string,
    candidateTypeDisplay: string,
  ): SectionBlock {
    return {
      block_id: BlockId.REVIEWER_DM_CONTEXT,
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: compose(
          `${mention(
            requestor,
          )} has requested a HackerRank review done in the following languages:`,
          ul(...languages),
          bold(`Candidate Type: ${candidateTypeDisplay}`),
          bold(`The review is needed by end of day ${deadlineDisplay}`),
          compose(
            bold('Test Information:'),
            'The test has 4 questions: 2 easy and 2 medium difficulty.\nSection 1 contains the easy questions, Section 2 contains the medium questions.\nCandidates should try to solve one problem from each section.\nThey have 70 minutes total to complete the test.',
          ),
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
