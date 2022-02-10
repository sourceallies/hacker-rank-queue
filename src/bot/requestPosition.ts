import { ShortcutParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { codeBlock, compose } from '@utils/text';
import { Interaction } from './enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { positionInQueueService } from '@/services/PositionInQueueService';
import { positionInQueueBlocksService } from '@/services/PositionInQueueBlocksService';

export const requestPosition = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('requestPosition.setup', 'Setting up Request Position command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_POSITION, this.shortcut.bind(this));
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    const userId = shortcut.user.id;
    log.d('requestPosition.shortcut', `Requesting position in queue, user.id=${userId}`);
    await ack();

    try {
      const allUsers = await userRepo.listAll();
      const positionInformation = positionInQueueService.getPositionInformation(userId, allUsers);
      if (positionInformation) {
        const positionBlocks = positionInQueueBlocksService.buildBlocks(positionInformation);
        await chatService.postBlocksMessage(client, userId, positionBlocks);
      } else {
        await chatService.sendDirectMessage(
          client,
          userId,
          'You are not in the queue yet. Use the Join Queue shortcut to join.',
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      log.e('requestPosition.shortcut', 'Failed to determine user position in queue', err);
      await chatService.sendDirectMessage(
        client,
        shortcut.user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },
};
