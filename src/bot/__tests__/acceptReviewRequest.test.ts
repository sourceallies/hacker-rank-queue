import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { BlockId, CandidateType } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { ActiveReview } from '@/database/models/ActiveReview';

jest.mock('@/services/RequestService', () => ({
  __esModule: true,
  addUserToAcceptedReviewers: resolve(),
}));

describe('acceptReviewRequest', () => {
  beforeEach(() => {
    // Reset the mock to default implementation
    // Note: Individual tests can override this mock as needed
    activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn();
  });

  const expectedCandidateTypeBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Candidate Type:* Full-time',
    },
  };
  const expectedHackerRankUrlBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*HackerRank Report:* <https://www.sourceallies.com|View Candidate Assessment>',
    },
  };
  const expectedHackerRankInstructionsBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '_To review the candidate\u2019s test, visit the URL above and log in with your Source Allies HackerRank account. If you have questions about using HackerRank\u2019s review features, please visit our <https://allies.atlassian.net/wiki/spaces/REI/pages/4868112402/Helpful+HackerRank+Features|documentation>._',
    },
  };
  const expectedHackerRankAccountHelpBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: "_Don't have a HackerRank account? Ping <@requester123> and they'll make one for you._",
    },
  };
  const expectedTestInfoBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Test Information:*\nThe test has 4 questions: 2 easy and 2 medium difficulty.\nSection 1 contains the easy questions, Section 2 contains the medium questions.\nCandidates should try to solve one problem from each section.\nThey have 70 minutes total to complete the test.',
    },
  };

  async function callHandleAccept() {
    const action = buildMockActionParam();
    action.body.actions = [
      {
        type: 'button',
        value: '123',
        text: {
          type: 'plain_text',
          text: 'Accept',
        },
        block_id: '39393939',
        action_id: '456',
        action_ts: '789',
      },
    ];
    action.body.message!.blocks = [
      {
        block_id: BlockId.REVIEWER_DM_CONTEXT,
      },
      {
        block_id: BlockId.REVIEWER_DM_BUTTONS,
      },
    ];
    action.body.message!.ts = '1234';

    // Mock review with user in pending list
    (activeReviewRepo.getReviewByThreadIdOrUndefined as jest.Mock).mockResolvedValue({
      hackerRankUrl: 'https://www.sourceallies.com',
      requestorId: 'requester123',
      candidateType: CandidateType.FULL_TIME,
      acceptedReviewers: [],
      declinedReviewers: [],
      pendingReviewers: [{ userId: action.body.user.id }],
    } as unknown as ActiveReview);

    userRepo.markNowAsLastReviewedDate = resolve();
    chatService.replyToReviewThread = resolve();
    chatService.updateDirectMessage = resolve();
    reviewCloser.closeReviewIfComplete = resolve();

    const app = buildMockApp();
    acceptReviewRequest.setup(app);
    await acceptReviewRequest.handleAccept(action);

    return { app, action };
  }

  function expectUpdatedWithBlocks(
    action: ReturnType<typeof buildMockActionParam>,
    ...additionalBlocks: object[]
  ) {
    expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
      action.client,
      action.body.user.id,
      '1234',
      [
        {
          block_id: BlockId.REVIEWER_DM_CONTEXT,
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*You accepted this review.*',
          },
        },
        ...additionalBlocks,
      ],
    );
  }

  describe('handleAccept', () => {
    it('should accept the review, update the original thread, and notify teammate services', async () => {
      const { app, action } = await callHandleAccept();

      const userId = action.body.user.id;
      expect(addUserToAcceptedReviewers).toHaveBeenCalledWith(userId, '123');
      expect(userRepo.markNowAsLastReviewedDate).toHaveBeenCalledWith(userId);
      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        action.client,
        '123',
        `<@${userId}> has agreed to review this submission.`,
      );
      expectUpdatedWithBlocks(
        action,
        expectedCandidateTypeBlock,
        expectedHackerRankUrlBlock,
        expectedHackerRankInstructionsBlock,
        expectedHackerRankAccountHelpBlock,
        expectedTestInfoBlock,
      );
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, '123');
    });

    it('should ignore duplicate accept clicks when user already accepted', async () => {
      const action = buildMockActionParam();
      const userId = action.body.user.id;
      action.body.actions = [
        {
          type: 'button',
          value: '123',
          text: {
            type: 'plain_text',
            text: 'Accept',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      // Mock review where user already accepted (not in pending)
      (activeReviewRepo.getReviewByThreadIdOrUndefined as jest.Mock).mockResolvedValue({
        hackerRankUrl: 'https://www.sourceallies.com',
        acceptedReviewers: [{ userId }],
        declinedReviewers: [],
        pendingReviewers: [],
      } as unknown as ActiveReview);

      const mockUpdateDirectMessage = jest.fn().mockReturnValue(() => Promise.resolve());
      const mockMarkNow = jest.fn().mockReturnValue(() => Promise.resolve());

      chatService.updateDirectMessage = mockUpdateDirectMessage;
      userRepo.markNowAsLastReviewedDate = mockMarkNow;

      const app = buildMockApp();
      acceptReviewRequest.setup(app);
      await acceptReviewRequest.handleAccept(action);

      expect(addUserToAcceptedReviewers).not.toHaveBeenCalled();
      expect(mockMarkNow).not.toHaveBeenCalled();
      expect(mockUpdateDirectMessage).not.toHaveBeenCalled();
    });

    it('should ignore duplicate accept clicks when user already declined', async () => {
      const action = buildMockActionParam();
      const userId = action.body.user.id;
      action.body.actions = [
        {
          type: 'button',
          value: '123',
          text: {
            type: 'plain_text',
            text: 'Accept',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      // Mock review where user already declined (not in pending)
      (activeReviewRepo.getReviewByThreadIdOrUndefined as jest.Mock).mockResolvedValue({
        hackerRankUrl: 'https://www.sourceallies.com',
        acceptedReviewers: [],
        declinedReviewers: [{ userId }],
        pendingReviewers: [],
      } as unknown as ActiveReview);

      const mockUpdateDirectMessage = jest.fn().mockReturnValue(() => Promise.resolve());
      const mockMarkNow = jest.fn().mockReturnValue(() => Promise.resolve());

      chatService.updateDirectMessage = mockUpdateDirectMessage;
      userRepo.markNowAsLastReviewedDate = mockMarkNow;

      const app = buildMockApp();
      acceptReviewRequest.setup(app);
      await acceptReviewRequest.handleAccept(action);

      expect(addUserToAcceptedReviewers).not.toHaveBeenCalled();
      expect(mockMarkNow).not.toHaveBeenCalled();
      expect(mockUpdateDirectMessage).not.toHaveBeenCalled();
    });

    it('should gracefully handle when review no longer exists (closed by concurrent action)', async () => {
      const action = buildMockActionParam();
      action.body.actions = [
        {
          type: 'button',
          value: '123',
          text: {
            type: 'plain_text',
            text: 'Accept',
          },
          block_id: '39393939',
          action_id: '456',
          action_ts: '789',
        },
      ];

      // Mock review not found (closed by another concurrent accept)
      (activeReviewRepo.getReviewByThreadIdOrUndefined as jest.Mock).mockResolvedValue(undefined);

      const mockUpdateDirectMessage = jest.fn().mockReturnValue(() => Promise.resolve());
      const mockMarkNow = jest.fn().mockReturnValue(() => Promise.resolve());

      chatService.updateDirectMessage = mockUpdateDirectMessage;
      userRepo.markNowAsLastReviewedDate = mockMarkNow;

      const app = buildMockApp();
      acceptReviewRequest.setup(app);
      await acceptReviewRequest.handleAccept(action);

      expect(addUserToAcceptedReviewers).not.toHaveBeenCalled();
      expect(mockMarkNow).not.toHaveBeenCalled();
      expect(mockUpdateDirectMessage).not.toHaveBeenCalled();
      expect(reviewCloser.closeReviewIfComplete).not.toHaveBeenCalled();
    });
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
