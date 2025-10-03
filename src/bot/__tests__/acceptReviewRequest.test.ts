import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { BlockId } from '@bot/enums';
import { chatService } from '@/services/ChatService';
import { userRepo } from '@repos/userRepo';
import { addUserToAcceptedReviewers } from '@/services/RequestService';
import { reviewCloser } from '@/services/ReviewCloser';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { ActiveReview } from '@/database/models/ActiveReview';
import log from '@utils/log';
import {
  HackParserIntegrationEnabled,
  generateHackParserPresignedURL,
  listHackParserCodeKeys,
} from '@/services/HackParserService';

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

jest.mock('@/services/HackParserService', () => ({
  __esModule: true,
  HackParserIntegrationEnabled: jest.fn().mockReturnValue(true),
  generateHackParserPresignedURL: jest.fn(
    async () => 'https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value',
  ),
  listHackParserCodeKeys: jest.fn(async () => [
    'example/First Problem.js',
    'example/Second Problem.py',
  ]),
}));

describe('acceptReviewRequest', () => {
  beforeEach(() => {
    // Reset the mock to default implementation
    // Note: Individual tests can override this mock as needed
    activeReviewRepo.getReviewByThreadIdOrFail = jest.fn();
  });

  const expectedHackParserPDFBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'HackerRank PDF: <https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value|example.pdf>',
    },
  };
  const expectedHackParserCodeResultBlocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Code results from above PDF via HackParser:',
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
  ];

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
    (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockResolvedValue({
      pdfIdentifier: 'example.pdf',
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
            text: 'You accepted this review.',
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
        expectedHackParserPDFBlock,
        ...expectedHackParserCodeResultBlocks,
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
      (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockResolvedValue({
        pdfIdentifier: 'example.pdf',
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
      (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockResolvedValue({
        pdfIdentifier: 'example.pdf',
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
  });

  it('should not check for HackParser results when integration is disabled', async () => {
    (HackParserIntegrationEnabled as jest.Mock).mockReturnValue(false);
    (listHackParserCodeKeys as jest.Mock).mockResolvedValue([]);

    await callHandleAccept();

    // Note: getReviewByThreadIdOrFail is called once for the idempotency check, not for HackParser
    expect(activeReviewRepo.getReviewByThreadIdOrFail).toHaveBeenCalledTimes(1);
    expect(listHackParserCodeKeys).not.toHaveBeenCalled();
  });

  it('should work where there is no PDF identifier', async () => {
    (activeReviewRepo.getReviewByThreadIdOrFail as jest.Mock).mockResolvedValue({
      pdfIdentifier: '',
      acceptedReviewers: [],
      declinedReviewers: [],
      pendingReviewers: [{ userId: 'test-user-id' }],
    } as unknown as ActiveReview);

    const { action } = await callHandleAccept();

    expectUpdatedWithBlocks(action);
  });

  it('should work when there is a PDF identifier but no results in the S3 bucket', async () => {
    (HackParserIntegrationEnabled as jest.Mock).mockReturnValue(true);
    (listHackParserCodeKeys as jest.Mock).mockResolvedValue([]);
    (generateHackParserPresignedURL as jest.Mock).mockResolvedValue(
      'https://bucket-name.s3.region.amazonaws.com/filename.ext?key=value',
    );

    const { action } = await callHandleAccept();

    expectUpdatedWithBlocks(action, expectedHackParserPDFBlock);
  });

  describe('should work when there is an error during the process, such as the', () => {
    it('presigned not being able to be generated', async () => {
      (generateHackParserPresignedURL as jest.Mock).mockRejectedValueOnce(
        new Error('Error generating presigned url'),
      );

      await callHandleAccept();

      expect(log.e).toHaveBeenCalledWith(
        'acceptReviewRequest.handleAccept',
        'Error generating HackParser text blocks',
        new Error('Error generating presigned url'),
      );
    });

    it('files not being able to be listed from the S3', async () => {
      (listHackParserCodeKeys as jest.Mock).mockRejectedValueOnce(
        new Error('Error listing files in S3'),
      );

      await callHandleAccept();

      expect(log.e).toHaveBeenCalledWith(
        'acceptReviewRequest.handleAccept',
        'Error generating HackParser text blocks',
        new Error('Error listing files in S3'),
      );
    });
  });

  it('generating S3 presigned URLs', async () => {
    (generateHackParserPresignedURL as jest.Mock).mockRejectedValueOnce(
      new Error('Error generating presigned url'),
    );

    await callHandleAccept();

    expect(log.e).toHaveBeenCalledWith(
      'acceptReviewRequest.handleAccept',
      'Error generating HackParser text blocks',
      new Error('Error generating presigned url'),
    );
  });

  it('listing files in S3', async () => {
    (listHackParserCodeKeys as jest.Mock).mockRejectedValueOnce(
      new Error('Error listing files in S3'),
    );

    await callHandleAccept();

    expect(log.e).toHaveBeenCalledWith(
      'acceptReviewRequest.handleAccept',
      'Error generating HackParser text blocks',
      new Error('Error listing files in S3'),
    );
  });
});

function resolve() {
  return jest.fn().mockReturnValue(() => Promise.resolve());
}
