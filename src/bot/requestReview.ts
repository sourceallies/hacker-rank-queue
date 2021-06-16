import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { BOT_ICON_URL, BOT_USERNAME } from './constants';
import { Interaction } from './enums';

export const requestReview = {
  app: (undefined as unknown) as App,

  setup(app: App): void {
    log.d('requestReview.setup', 'Setting up RequestReview command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_REVIEW, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_REQUEST_REVIEW, this.callback.bind(this));
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    await ack();

    const userId = shortcut.user.id;

    await client.chat.postMessage({
      channel: userId,
      text: 'This is not implemented yet',
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
    });
    throw Error('Not implemented');
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();

    const userId = body.user.id;

    await client.chat.postMessage({
      channel: userId,
      text: 'This is not implemented yet',
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
    });
    throw Error('Not implemented');
  },
};
