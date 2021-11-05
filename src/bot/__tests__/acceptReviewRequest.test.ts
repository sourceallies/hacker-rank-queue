import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';

jest.mock('@/services/RequestService', () => ({
  __esModule: true,
  addUserToAcceptedReviewers: resolve(),
}));

describe('acceptReviewRequest', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  describe('handleAccept', () => {
    it('should accept the review, update the original thread, and notify teammate services', async () => {
      const action = buildMockActionParam();
      const threadId = '123';
      action.body.actions = [
        {
          type: 'button',
          value: threadId,
          text: {
            type: 'plain_text',
            text: 'Accept',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];
      const contextBlock = {
        block_id: BlockId.REVIEWER_DM_CONTEXT,
      };
      const buttonBlock = {
        block_id: BlockId.REVIEWER_DM_BUTTONS,
      };
      action.body.message!.blocks = [contextBlock, buttonBlock];
      action.body.message!.ts = '1234';

      userRepo.markNowAsLastReviewedDate = resolve();
      chatService.replyToReviewThread = resolve();
      chatService.updateMessage = resolve();

      await acceptReviewRequest.handleAccept(action);

      const userId = action.body.user.id;
      expect(addUserToAcceptedReviewers).toHaveBeenCalledWith(userId, threadId);
      expect(userRepo.markNowAsLastReviewedDate).toHaveBeenCalledWith(userId);
      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        action.client,
        threadId,
        `<@${userId}> has agreed to review this HackerRank.`,
      );
      expect(chatService.updateMessage).toHaveBeenCalledWith(action.client, userId, '1234', [
        contextBlock,
        {
          type: 'context',
          elements: [
            {
              type: 'plain_text',
              text: 'You accepted this review.',
              emoji: true,
            },
          ],
        },
      ]);
    });
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
