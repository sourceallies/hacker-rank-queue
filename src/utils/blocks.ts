import { ActionId, BlockId, CandidateType, CandidateTypeLabel } from '@bot/enums';
import { BlockAction, ButtonAction, SlackViewAction } from '@slack/bolt';
import { PlainTextOption } from '@slack/types';

/** Shared by the review and pairing request forms, which ask the same question. */
export function candidateTypeOptions(): PlainTextOption[] {
  return [CandidateType.FULL_TIME, CandidateType.APPRENTICE].map(candidateType => ({
    text: { text: CandidateTypeLabel.get(candidateType) || '', type: 'plain_text' },
    value: candidateType,
  }));
}

export const blockUtils = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBlockValue(body: SlackViewAction, blockAndActionId: string): any {
    return body.view.state.values[blockAndActionId][blockAndActionId];
  },

  getLanguageFromBody(body: SlackViewAction): string[] {
    const blockValue = this.getBlockValue(body, ActionId.LANGUAGE_SELECTIONS);
    return blockValue.selected_options.map(({ value }: { value: string }) => value);
  },

  /**
   * Remove any blocks with the provided `blockId` and return the remaining blocks.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeBlock(body: BlockAction<ButtonAction>, blockId: string): any {
    if (!body.message) {
      throw new Error(`Unable to remove ${blockId} from message. No body message exists.`);
    }

    return body.message.blocks.filter(
      (block: { block_id: BlockId }) => block.block_id !== BlockId.REVIEWER_DM_BUTTONS,
    );
  },
};
