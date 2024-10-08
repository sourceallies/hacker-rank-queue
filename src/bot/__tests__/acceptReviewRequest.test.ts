import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { ActiveReview } from '@/database/models/ActiveReview';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import log from '@utils/log';

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

process.env.HACK_PARSER_BUCKET_NAME = 'hack-parser-bucket-name';

activeReviewRepo.getReviewByThreadIdOrFail = jest.fn(
  async () =>
    ({
      pdfIdentifier: 'example.pdf',
    }) as ActiveReview,
);

describe('acceptReviewRequest', () => {
  async function callHandleAccept() {
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

    return { app, action, threadId, sectionBlock };
  }

  describe('handleAccept', () => {
    it('should accept the review, update the original thread, and notify teammate services', async () => {
      const { app, action, threadId, sectionBlock } = await callHandleAccept();

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
            text: 'Code results from `example.pdf` via HackParser:',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ' •  <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|First Problem.js>',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ' •  <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|Second Problem.py>',
          },
        },
      ]);
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, threadId);
    });

    it('should accept the review, update the original thread, and notify teammate services V2', async () => {
      const { app, action, threadId, sectionBlock } = await callHandleAccept();

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
            text: 'Code results from `example.pdf` via HackParser:',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ' •  <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|First Problem.js>',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ' •  <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|Second Problem.py>',
          },
        },
      ]);
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, threadId);
    });
  });

  it('should not check for HackParser results when integration is disabled', async () => {
    process.env.HACK_PARSER_BUCKET_NAME = '';

    await callHandleAccept();

    expect(activeReviewRepo.getReviewByThreadIdOrFail).not.toHaveBeenCalled();

    process.env.HACK_PARSER_BUCKET_NAME = 'hack-parser-bucket-name';
  });

  it('should work where there is no PDF identifier', async () => {
    (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockResolvedValueOnce({
      pdfIdentifier: '',
    });

    const { action, sectionBlock } = await callHandleAccept();

    // expect blocks to not contain the HackerRank PDF block
    const userId = action.body.user.id;
    expect(chatService.updateDirectMessage).toHaveBeenCalledWith(action.client, userId, '1234', [
      sectionBlock,
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'You accepted this review.',
        },
      },
    ]);
  });

  it('should work when there is a PDF identifier but no results in the S3 bucket', async () => {
    (new S3Client().send as jest.Mock).mockImplementationOnce(async () => ({}));

    const { action, sectionBlock } = await callHandleAccept();

    const userId = action.body.user.id;
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
    ]);
  });

  describe('should work when there is an error during the process', () => {
    it('review cannot be found', async () => {
      (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockRejectedValueOnce(
        new Error('Review not found'),
      );

      await callHandleAccept();

      expect(log.e).toHaveBeenCalledWith(
        'acceptReviewRequest.handleAccept',
        'Error getting review data',
        new Error('Review not found'),
      );
    });
  });

  it('generating S3 presigned URLs', async () => {
    (getSignedUrl as jest.Mock).mockRejectedValueOnce(new Error('Error generating presigned url'));

    await callHandleAccept();

    expect(log.e).toHaveBeenCalledWith(
      'acceptReviewRequest.handleAccept',
      'Error getting review data',
      new Error('Error generating presigned url'),
    );
  });

  it('listing files in S3', async () => {
    (new S3Client().send as jest.Mock).mockRejectedValueOnce(
      new Error('Error listing files in S3'),
    );
    await callHandleAccept();

    expect(log.e).toHaveBeenCalledWith(
      'acceptReviewRequest.handleAccept',
      'Error getting review data',
      new Error('Error listing files in S3'),
    );
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
