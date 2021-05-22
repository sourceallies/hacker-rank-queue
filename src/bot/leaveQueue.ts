import { userRepo } from '@repos/userRepo';
import { App, Middleware, SlackShortcut, SlackShortcutMiddlewareArgs } from '@slack/bolt';
import { codeBlock, compose } from '@utils/text';
import { BOT_ICON_URL, BOT_USERNAME } from './constants';
import { Interaction } from './enums';

type ShortcutParam = Parameters<Middleware<SlackShortcutMiddlewareArgs<SlackShortcut>>>[0];

export const leaveQueue = {
  app: (undefined as unknown) as App,

  setup(app: App): void {
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_LEAVE_QUEUE, this.shortcut.bind(this));
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    await ack();

    const userId = shortcut.user.id;

    let text: string;
    try {
      await userRepo.remove(userId);
      text = "You've been removed from the HackerRank review queue";
    } catch (err) {
      text = compose('Something went wrong :/', codeBlock(err.message));
    }
    await client.chat.postMessage({
      channel: userId,
      text,
      username: BOT_USERNAME,
      icon_url: BOT_ICON_URL,
    });
  },
};
