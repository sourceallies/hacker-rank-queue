import { ActionId, BlockId, InterviewFormat, InterviewFormatLabel } from '@bot/enums';
import { AvailabilityWindow } from '@models/PairingSession';
import { compose, formatSlot, mention, ul } from '@utils/text';
import { PAIRING_SESSION_HOURS } from '@utils/pairingSlots';
import { Block } from '@slack/types';

export const pairingRequestBuilder = {
  buildTeammateDMBlocks(
    requestor: { id: string },
    candidateName: string,
    languages: string[],
    format: InterviewFormat,
    windows: AvailabilityWindow[],
    threadId: string,
  ): Block[] {
    return [
      {
        block_id: BlockId.PAIRING_DM_CONTEXT,
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: compose(
            `${mention(requestor)} needs a teammate for a pairing session.`,
            `*Candidate:* ${candidateName}`,
            `*Languages:* ${languages.join(', ')}`,
            `*Format:* ${InterviewFormatLabel.get(format) ?? format}`,
          ),
        },
      } as Block,
      {
        block_id: BlockId.PAIRING_DM_SLOTS,
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: compose(
            `Sessions run *${PAIRING_SESSION_HOURS} hours*. ${candidateName} is available:`,
            ul(...windows.map(w => formatSlot(w.date, w.startTime, w.endTime))),
            'Pick the start times that work for you — whatever you pick, we book.',
          ),
        },
      } as Block,
      {
        block_id: BlockId.PAIRING_DM_ACTIONS,
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ActionId.PAIRING_OPEN_PICKER,
            text: { type: 'plain_text', text: 'Pick your times' },
            style: 'primary',
            value: threadId,
          },
          {
            type: 'button',
            action_id: ActionId.PAIRING_DECLINE_ALL,
            text: { type: 'plain_text', text: 'None of these' },
            style: 'danger',
            value: threadId,
          },
        ],
      } as Block,
    ];
  },

  buildTeammateDM(
    teammateId: string,
    requestor: { id: string },
    candidateName: string,
    languages: string[],
    format: InterviewFormat,
    windows: AvailabilityWindow[],
    threadId: string,
  ) {
    return {
      channel: teammateId,
      text: `Pairing session requested for ${candidateName}`,
      blocks: this.buildTeammateDMBlocks(
        requestor,
        candidateName,
        languages,
        format,
        windows,
        threadId,
      ),
    };
  },
};
