import { ActionId } from '@bot/enums';
import { SlackViewAction } from '@slack/bolt';

export const blockUtils = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBlockValue(body: SlackViewAction, blockAndActionId: string): any {
    return body.view.state.values[blockAndActionId][blockAndActionId];
  },

  getLanguageFromBody(body: SlackViewAction): string[] {
    const blockValue = this.getBlockValue(body, ActionId.LANGUAGE_SELECTIONS);
    return blockValue.selected_options.map(({ value }: { value: string }) => value);
  },
};
