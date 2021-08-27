import { ActionParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId } from './enums';

export const declineReviewRequest = {
  app: (undefined as unknown) as App,

  setup(app: App): void {
    log.d('declineReviewRequest.setup', 'Setting up declineReviewRequest action handler');
    this.app = app;
    app.action(ActionId.REVIEWER_DM_DECLINE, this.handleDeny.bind(this));
  },

  async handleDeny({ ack }: ActionParam): Promise<void> {
    await ack();
    // TODO: update original message to remove buttons
    log.d('declineReviewRequest.handleDeny - not implemented yet!');
  },
};
