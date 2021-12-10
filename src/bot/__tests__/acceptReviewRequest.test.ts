import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { activeReviewRepo } from '@repos/activeReviewsRepo';

jest.mock('@/services/RequestService', () => ({
  __esModule: true,
  addUserToAcceptedReviewers: resolve(),
}));

describe('acceptReviewRequest', () => {
  const OLD_ENV = process.env;

  afterAll(() => {
    process.env = OLD_ENV;
  });

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
      chatService.updateDirectMessage = resolve();
      chatService.postBlocksMessage = resolve();
      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue({
        hackerRankUrl: 'https://www.example.org',
      });
      process.env.FEEDBACK_FORM_URL = 'https://www.feedback.com';

      await acceptReviewRequest.handleAccept(action);

      const userId = action.body.user.id;
      expect(addUserToAcceptedReviewers).toHaveBeenCalledWith(userId, threadId);
      expect(userRepo.markNowAsLastReviewedDate).toHaveBeenCalledWith(userId);
      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        action.client,
        threadId,
        `<@${userId}> has agreed to review this HackerRank.`,
      );
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(action.client, userId, '1234', [
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
      expect(chatService.postBlocksMessage).toHaveBeenCalledWith(action.client, userId, [
        {
          block_id: 'accepted-review-block',
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Thank you for taking the time to review this HackerRank!

<https://www.example.org|View the candidate's results>

After you have reviewed the information given on the candidate, please provide your feedback through <https://www.feedback.com|this form>`,
          },
        },
      ]);
    });
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
