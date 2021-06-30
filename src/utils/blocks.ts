import { ActionId } from '@bot/enums';
import { SlackViewAction } from '@slack/bolt';

export const blockUtils = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBlockValue(body: SlackViewAction, blockIndex: number, actionId: ActionId): any {
    const blockId = body.view.blocks[blockIndex].block_id;
    return body.view.state.values[blockId][actionId];
  },

  getLanguageFromBody(body: SlackViewAction, blockIndex: number): string[] {
    const blockValue = this.getBlockValue(body, blockIndex, ActionId.LANGUAGE_SELECTIONS);
    return blockValue.selected_options.map(({ value }: { value: string }) => value);
  },
};
