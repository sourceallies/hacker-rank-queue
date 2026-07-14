import { ActionId, BlockId, formatLabel } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import { bold, compose, formatSlot, mention, textBlock, ul } from '@utils/text';
import { PAIRING_SESSION_HOURS } from '@utils/pairingSlots';
import { Block } from '@slack/types';

export const pairingRequestBuilder = {
  /** The candidate/languages/format header, shared by the DM, the picker, and the confirmation. */
  sessionHeader(session: PairingSession): string {
    return compose(
      bold(`Candidate: ${session.candidateName}`),
      bold(`Languages: ${session.languages.join(', ')}`),
      bold(`Format: ${formatLabel(session.format)}`),
    );
  },

  buildTeammateDMBlocks(session: PairingSession): Block[] {
    return [
      {
        ...textBlock(
          compose(
            `${mention({ id: session.requestorId })} needs a teammate for a pairing session.`,
            this.sessionHeader(session),
          ),
        ),
        block_id: BlockId.PAIRING_DM_CONTEXT,
      } as Block,
      {
        ...textBlock(
          compose(
            `Sessions run *${PAIRING_SESSION_HOURS} hours*. ${session.candidateName} is available:`,
            // Only a session written before the availabilityWindows column existed can be empty
            // here; a new one can't get past validation without a window. Such a session's slots are
            // also un-sliced, so its picker is wrong too — this keeps the DM from rendering a blank
            // paragraph, it does not make an old session correct. Drain the sheet before deploying.
            session.availabilityWindows.length > 0
              ? ul(
                  ...session.availabilityWindows.map(w =>
                    formatSlot(w.date, w.startTime, w.endTime),
                  ),
                )
              : '_No availability was recorded for this session._',
            'Pick the start times that work for you — whatever you pick, we book.',
          ),
        ),
        block_id: BlockId.PAIRING_DM_SLOTS,
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
            value: session.threadId,
          },
          {
            type: 'button',
            action_id: ActionId.PAIRING_DECLINE_ALL,
            text: { type: 'plain_text', text: 'None of these' },
            style: 'danger',
            value: session.threadId,
          },
        ],
      } as Block,
    ];
  },

  buildTeammateDM(teammateId: string, session: PairingSession) {
    return {
      channel: teammateId,
      text: `Pairing session requested for ${session.candidateName}`,
      blocks: this.buildTeammateDMBlocks(session),
    };
  },
};
