import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { ActiveReview } from '@/database/models/ActiveReview';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(
    async () => 'https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value',
  ),
}));

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn(async () => ({
    Contents: [
      {
        Key: 'example/results.json',
      },
      {
        Key: 'example/First Problem.js',
      },
      {
        Key: 'example/Second Problem.py',
      },
    ],
  }));
  return {
    S3Client: jest.fn(() => ({
      send,
    })),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    ListObjectsV2Command: jest.fn(),
  };
});

jest.mock('@/services/RequestService', () => ({
  __esModule: true,
  addUserToAcceptedReviewers: resolve(),
}));

activeReviewRepo.getReviewByThreadId = jest.fn(
  async () =>
    ({
      pdfIdentifier: 'example.pdf',
    }) as ActiveReview,
);

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
      const sectionBlock = {
        block_id: BlockId.REVIEWER_DM_CONTEXT,
      };
      const buttonBlock = {
        block_id: BlockId.REVIEWER_DM_BUTTONS,
      };
      action.body.message!.blocks = [sectionBlock, buttonBlock];
      action.body.message!.ts = '1234';

      userRepo.markNowAsLastReviewedDate = resolve();
      chatService.replyToReviewThread = resolve();
      chatService.updateDirectMessage = resolve();
      reviewCloser.closeReviewIfComplete = resolve();

      const app = buildMockApp();
      acceptReviewRequest.setup(app);
      await acceptReviewRequest.handleAccept(action);

      const userId = action.body.user.id;
      expect(addUserToAcceptedReviewers).toHaveBeenCalledWith(userId, threadId);
      expect(userRepo.markNowAsLastReviewedDate).toHaveBeenCalledWith(userId);
      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        action.client,
        threadId,
        `<@${userId}> has agreed to review this submission.`,
      );
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(action.client, userId, '1234', [
        sectionBlock,
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'You accepted this review.',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'HackerRank PDF: <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|example.pdf>',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Code results from `example.pdf` via HackParser:\n\n- <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|First Problem.js>\n- <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|Second Problem.py>',
          },
        },
      ]);
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, threadId);
    });
  });

  it.todo('should work where there is no PDF identifier');
  it.todo('should work when there is a PDF identifier but no results in the S3 bucket');
  it.todo('should work when there is an error during the process');
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
