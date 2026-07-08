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
import { expandRequest } from '@/services/RequestService';
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
        pendingReviewers: [{ userId: '9208123', messageTimestamp: '123' }],
        nextExpandAt: 0,
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
          { userId: '9208123', messageTimestamp: '123' },
          { userId: userId, messageTimestamp: '456' },
        ],
        nextExpandAt: 0,
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
        pendingReviewers: [{ userId: '9208123', messageTimestamp: '123' }],
        nextExpandAt: 0,
        hackerRankUrl: '',
        yardstickUrl: '',
      });
    });
  });

  describe('expandRequest', () => {
    it('should add the next person without closing any DMs or touching declined list', async () => {
      const nextUserId = '0239482';
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
        pendingReviewers: [{ userId: 'existing', messageTimestamp: '1234' }],
        nextExpandAt: 0,
        hackerRankUrl: '',
        yardstickUrl: '',
      };

      const nextReviewer: PartialPendingReviewer = { userId: nextUserId };

      process.env.REQUEST_EXPIRATION_MIN = '30';
      process.env.WORKDAY_START_HOUR = '8';
      process.env.WORKDAY_END_HOUR = '17';
      process.env.NUMBER_OF_INITIAL_REVIEWERS = '5';

      activeReviewRepo.getReviewByThreadIdOrFail = jest.fn().mockResolvedValue(review);
      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);
      QueueService.nextInLine = jest
        .fn()
        .mockResolvedValueOnce(nextReviewer)
        .mockResolvedValue(undefined);
      chatService.updateDirectMessage = jest.fn();
      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('456');
      reviewCloser.closeReviewIfComplete = jest.fn();

      await expandRequest(app, review);

      expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
      expect(reviewCloser.closeReviewIfComplete).not.toHaveBeenCalled();

      expect(activeReviewRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          nextExpandAt: expect.any(Number),
          pendingReviewers: expect.arrayContaining([
            expect.objectContaining({ userId: nextUserId }),
          ]),
          declinedReviewers: [],
        }),
      );

      expect(chatService.sendRequestReviewMessage).toHaveBeenCalledWith(
        app.client,
        nextUserId,
        threadId,
        { id: review.requestorId },
        review.languages,
        'Today',
        'Full-time',
      );
    });
  });
});

function acceptedUser(userId: string): AcceptedReviewer {
  return { userId, acceptedAt: new Date().getTime() };
}

function declinedUser(userId: string): DeclinedReviewer {
  return { userId, declinedAt: new Date().getTime() };
}
