import {
  AcceptedReviewer,
  ActiveReview,
  DeclinedReviewer,
  PartialPendingReviewer,
} from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { CandidateType, Deadline } from '@bot/enums';
import { RequestService, QueueService } from '@/services';
import { chatService } from '@/services/ChatService';
import { declineRequest, sendWave } from '@/services/RequestService';
import { buildMockApp } from '@utils/slackMocks';
import { reviewCloser } from '@/services/ReviewCloser';

describe('RequestService', () => {
  describe('addUserToAcceptedReviewers', () => {
    it('should throw an error if the user is not a pending reviewer', async () => {
      const userId = '0239482';
      const threadId = '123';
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: 'some-id',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('999')],
        declinedReviewers: [declinedUser('111'), declinedUser('222')],
        pendingReviewers: [{ userId: '9208123', offeredAt: 123, messageTimestamp: '123' }],
        hackerRankUrl: '',
        yardstickUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue(review);

      await expect(RequestService.addUserToAcceptedReviewers(userId, threadId)).rejects.toThrow(
        `${userId} attempted to accept reviewing ${threadId} but was not on the list of pending users`,
      );
    });

    it('should add the user to the accepted reviewers list and remove from pending', async () => {
      const userId = '0239482';
      const threadId = '123';
      const requestedDate = new Date();
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: '456',
        languages: ['Java'],
        requestedAt: requestedDate,
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: 'some-id',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('999')],
        declinedReviewers: [declinedUser('111'), declinedUser('222')],
        pendingReviewers: [
          { userId: '9208123', offeredAt: 123, messageTimestamp: '123' },
          { userId: userId, offeredAt: 456, messageTimestamp: '456' },
        ],
        hackerRankUrl: '',
        yardstickUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue(review);
      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);

      await RequestService.addUserToAcceptedReviewers(userId, threadId);

      expect(activeReviewRepo.update).toHaveBeenCalledWith({
        threadId: threadId,
        requestorId: '456',
        languages: ['Java'],
        requestedAt: requestedDate,
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: 'some-id',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 2,
        acceptedReviewers: [
          { userId: '999', acceptedAt: expect.any(Number) },
          { userId, acceptedAt: expect.any(Number) },
        ],
        declinedReviewers: [
          { userId: '111', declinedAt: expect.any(Number) },
          { userId: '222', declinedAt: expect.any(Number) },
        ],
        pendingReviewers: [{ userId: '9208123', offeredAt: 123, messageTimestamp: '123' }],
        hackerRankUrl: '',
        yardstickUrl: '',
      });
    });
  });

  describe('declineRequest', () => {
    it('should decline the request and let the next user in line know', async () => {
      const userId = '0239482';
      const expiringUserId = '9208123';
      const threadId = '123';
      const app = buildMockApp();
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: '',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 2,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [{ userId: expiringUserId, offeredAt: 123, messageTimestamp: '1234' }],
        hackerRankUrl: '',
        yardstickUrl: '',
      };

      const nextReviewer: PartialPendingReviewer = {
        userId: userId,
        offeredAt: 929292,
      };

      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);
      QueueService.nextInLine = jest.fn().mockResolvedValue(nextReviewer);
      chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('123');
      reviewCloser.closeReviewIfComplete = jest.fn().mockResolvedValue(undefined);

      await declineRequest(app, review, expiringUserId);

      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        app.client,
        expiringUserId,
        '1234',
        expect.arrayContaining([
          expect.objectContaining({
            text: {
              text: 'Thanks! You will keep your spot in the queue.',
              type: 'mrkdwn',
            },
          }),
        ]),
      );

      expect(activeReviewRepo.update).toHaveBeenCalledWith({
        ...review,
        pendingReviewers: [{ ...nextReviewer, messageTimestamp: '123' }],
        declinedReviewers: [{ userId: expiringUserId, declinedAt: expect.any(Number) }],
      });

      expect(chatService.sendRequestReviewMessage).toHaveBeenCalledWith(
        app.client,
        userId,
        threadId,
        { id: review.requestorId },
        review.languages,
        'Today',
        'Full-time',
      );
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, threadId);
    });
  });

  describe('sendWave', () => {
    function openReview(): ActiveReview {
      return {
        threadId: '123',
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.END_OF_DAY,
        candidateIdentifier: '',
        candidateType: CandidateType.FULL_TIME,
        reviewersNeededCount: 2,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [],
        hackerRankUrl: '',
        yardstickUrl: '',
      };
    }

    beforeEach(() => {
      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);
      chatService.sendRequestReviewMessage = jest
        .fn()
        .mockImplementation(async (_client, userId: string) => `ts-${userId}`);
    });

    it('offers the review to the next teammates in line, up to the wave size', async () => {
      const queue = ['A', 'B', 'C', 'D'];
      QueueService.nextInLine = jest.fn(async (review: ActiveReview) => {
        const taken = new Set(review.pendingReviewers.map(p => p.userId));
        const userId = queue.find(id => !taken.has(id));
        return userId ? { userId, offeredAt: 5 } : undefined;
      });
      const review = openReview();

      const sent = await sendWave(buildMockApp(), review, 3);

      expect(sent).toBe(3);
      expect(review.pendingReviewers).toEqual([
        { userId: 'A', offeredAt: 5, messageTimestamp: 'ts-A' },
        { userId: 'B', offeredAt: 5, messageTimestamp: 'ts-B' },
        { userId: 'C', offeredAt: 5, messageTimestamp: 'ts-C' },
      ]);
    });

    it('stops early when the queue runs out', async () => {
      QueueService.nextInLine = jest
        .fn()
        .mockResolvedValueOnce({ userId: 'A', offeredAt: 5 })
        .mockResolvedValue(undefined);
      const review = openReview();

      const sent = await sendWave(buildMockApp(), review, 5);

      expect(sent).toBe(1);
      expect(review.pendingReviewers.map(p => p.userId)).toEqual(['A']);
    });
  });
});

function acceptedUser(userId: string): AcceptedReviewer {
  return { userId, acceptedAt: new Date().getTime() };
}

function declinedUser(userId: string): DeclinedReviewer {
  return { userId, declinedAt: new Date().getTime() };
}
