import {
  ActionId,
  BlockId,
  CandidateType,
  CandidateTypeLabel,
  InterviewFormat,
  InterviewFormatLabel,
} from '@bot/enums';
import { PairingSlot } from '@models/PairingSession';
import { compose, formatSlot, mention } from '@utils/text';
import { Block } from '@slack/types';

function formatSlotLabel(slot: PairingSlot): string {
  return formatSlot(slot.date, slot.startTime, slot.endTime);
}

export const pairingRequestBuilder = {
  buildTeammateDMBlocks(
    requestor: { id: string },
    candidateName: string,
    languages: string[],
    format: InterviewFormat,
    candidateType: CandidateType,
    slots: PairingSlot[],
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
            `*Candidate:* ${candidateName} (${CandidateTypeLabel.get(candidateType) ?? candidateType})`,
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
          text: 'Check all slots you are available for:',
        },
        accessory: {
          type: 'checkboxes',
          action_id: ActionId.PAIRING_SLOT_SELECTIONS,
          options: slots.map(slot => ({
            text: { type: 'plain_text' as const, text: formatSlotLabel(slot) },
            value: slot.id,
          })),
        },
      } as Block,
      {
        block_id: BlockId.PAIRING_DM_ACTIONS,
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ActionId.PAIRING_SUBMIT_SLOTS,
            text: { type: 'plain_text', text: 'Submit availability' },
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
    candidateType: CandidateType,
    slots: PairingSlot[],
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
        candidateType,
        slots,
        threadId,
      ),
    };
  },
};
