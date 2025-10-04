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
      const activeReview = {
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [{ userId: action.body.user.id }],
      };

      activeReviewRepo.getReviewByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValueOnce(activeReview);
      chatService.updateDirectMessage = resolve();

      const app = buildMockApp();
      declineReviewRequest.setup(app);
      await declineReviewRequest.handleDecline(action);

      const userId = action.body.user.id;
      expect(activeReviewRepo.getReviewByThreadIdOrUndefined).toHaveBeenCalledWith(threadId);
      expect(RequestService.declineRequest).toHaveBeenCalledWith(app, activeReview, userId);
    });

    it('should ignore duplicate decline clicks when user already accepted', async () => {
      const action = buildMockActionParam();
      const userId = action.body.user.id;
      const threadId = '123';
      action.body.actions = [
        {
          type: 'button',
          value: threadId,
          text: {
            type: 'plain_text',
            text: 'Decline',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      const activeReview = {
        acceptedReviewers: [{ userId }],
        declinedReviewers: [],
        pendingReviewers: [], // User already accepted, so not in pending
      };

      activeReviewRepo.getReviewByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValueOnce(activeReview);
      chatService.updateDirectMessage = resolve();

      const app = buildMockApp();
      declineReviewRequest.setup(app);
      await declineReviewRequest.handleDecline(action);

      // Should not call decline because user is not in pending list
      expect(RequestService.declineRequest).not.toHaveBeenCalled();
    });

    it('should ignore duplicate decline clicks when user already declined', async () => {
      const action = buildMockActionParam();
      const userId = action.body.user.id;
      const threadId = '123';
      action.body.actions = [
        {
          type: 'button',
          value: threadId,
          text: {
            type: 'plain_text',
            text: 'Decline',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      const activeReview = {
        acceptedReviewers: [],
        declinedReviewers: [{ userId }],
        pendingReviewers: [], // User already declined, so not in pending
      };

      activeReviewRepo.getReviewByThreadIdOrUndefined = jest
        .fn()
        .mockResolvedValueOnce(activeReview);
      chatService.updateDirectMessage = resolve();

      const app = buildMockApp();
      declineReviewRequest.setup(app);
      await declineReviewRequest.handleDecline(action);

      // Should not call decline because user is not in pending list
      expect(RequestService.declineRequest).not.toHaveBeenCalled();
    });

    it('should gracefully handle when review no longer exists (closed by concurrent action)', async () => {
      const action = buildMockActionParam();
      const threadId = '123';
      action.body.actions = [
        {
          type: 'button',
          value: threadId,
          text: {
            type: 'plain_text',
            text: 'Decline',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      // Mock review not found (closed by another concurrent accept/decline)
      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValueOnce(undefined);
      chatService.updateDirectMessage = resolve();

      const app = buildMockApp();
      declineReviewRequest.setup(app);
      await declineReviewRequest.handleDecline(action);

      // Should not call decline because review no longer exists
      expect(RequestService.declineRequest).not.toHaveBeenCalled();
    });
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
