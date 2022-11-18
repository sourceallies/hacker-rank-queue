import { userRepo } from '@repos/userRepo';
import { App, Middleware, SlackShortcutMiddlewareArgs } from '@slack/bolt';
import log from '@utils/log';
import { codeBlock, compose } from '@utils/text';
import { Interaction } from './enums';
import { chatService } from '@/services/ChatService';

type ShortcutParam = Parameters<Middleware<SlackShortcutMiddlewareArgs>>[0];

export const leaveQueue = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('leaveQueue.setup', 'Setting up LeaveQueue command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_LEAVE_QUEUE, this.shortcut.bind(this));
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    await ack();

    const userId = shortcut.user.id;
    log.d('leaveQueue.shortcut', `User left queue: ${userId}`);

    let text: string;
    try {
      await userRepo.remove(userId);
      text = "You've been removed from the review queue";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('leaveQueue.shortcut', 'Failed to remove user', err);
      text = compose('Something went wrong :/', codeBlock(err.message));
    }
    await chatService.sendDirectMessage(client, userId, text);
  },
};
