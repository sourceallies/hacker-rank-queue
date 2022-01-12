import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { declineReviewRequest } from '../declineReviewRequest';
import { RequestService } from '@/services';

jest.mock('@/services/RequestService', () => ({
  __esModule: true,
  declineRequest: resolve(),
}));

describe('declineReviewRequest', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  describe('handleDecline', () => {
    it('should decline the review, call the request service to update the request and notify', async () => {
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
      const activeReview = Symbol('activeReview');

      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValueOnce(activeReview);
      chatService.updateDirectMessage = resolve();

      const app = buildMockApp();
      declineReviewRequest.setup(app);
      await declineReviewRequest.handleDecline(action);

      const userId = action.body.user.id;
      expect(activeReviewRepo.getReviewByThreadIdOrFail).toHaveBeenCalledWith(threadId);
      expect(RequestService.declineRequest).toHaveBeenCalledWith(app, activeReview, userId);
    });
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
