import { buildMockShortcutParam } from '@utils/slackMocks';
import { userRepo } from '@repos/userRepo';
import { positionInQueueService } from '@/services/PositionInQueueService';
import { requestPosition } from '@bot/requestPosition';
import { chatService } from '@/services/ChatService';
import { positionInQueueBlocksService } from '@/services/PositionInQueueBlocksService';
import { KnownBlock } from '@slack/types';

const USER = {
  id: 'user1',
  name: 'User 1',
  languages: ['Java', 'C#'],
  lastReviewedDate: undefined,
};

describe('requestPosition', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  describe('shortcut', () => {
    it('should notify the user if they are not in the queue', async () => {
      const shortcutParam = buildMockShortcutParam();

      userRepo.listAll = jest.fn().mockResolvedValue([USER]);
      positionInQueueService.getPositionInformation = jest.fn().mockReturnValue(undefined);
      chatService.sendDirectMessage = jest.fn().mockResolvedValue(undefined);

      await requestPosition.shortcut(shortcutParam);

      expect(chatService.sendDirectMessage).toHaveBeenCalledWith(
        shortcutParam.client,
        shortcutParam.shortcut.user.id,
        'You are not in the queue yet. Use the Join Queue shortcut to join.',
      );
    });

    it('should give the user position information if they are in the queue', async () => {
      const shortcutParam = buildMockShortcutParam();

      const positionInformation = {
        user: USER,
        languagePositions: [],
      };

      const blocks: KnownBlock[] = [{ type: 'divider' }];

      userRepo.listAll = jest.fn().mockResolvedValue([USER]);
      positionInQueueService.getPositionInformation = jest
        .fn()
        .mockReturnValue(positionInformation);
      positionInQueueBlocksService.buildBlocks = jest.fn().mockReturnValue(blocks);
      chatService.postBlocksMessage = jest.fn().mockResolvedValue(undefined);

      await requestPosition.shortcut(shortcutParam);

      expect(chatService.postBlocksMessage).toHaveBeenCalledWith(
        shortcutParam.client,
        shortcutParam.shortcut.user.id,
        blocks,
      );
    });
  });
});
