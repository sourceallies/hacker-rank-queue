import {
  AcceptedReviewer,
  ActiveReview,
  DeclinedReviewer,
  PartialPendingReviewer,
} from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { Deadline } from '@bot/enums';
import { RequestService, QueueService } from '@/services';
import { chatService } from '@/services/ChatService';
import { expireRequest } from '@/services/RequestService';
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
        reviewType: 'HackerRank',
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('999')],
        declinedReviewers: [declinedUser('111'), declinedUser('222')],
        pendingReviewers: [{ userId: '9208123', expiresAt: 123, messageTimestamp: '123' }],
        pdfIdentifier: '',
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
        reviewType: 'HackerRank',
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('999')],
        declinedReviewers: [declinedUser('111'), declinedUser('222')],
        pendingReviewers: [
          { userId: '9208123', expiresAt: 123, messageTimestamp: '123' },
          { userId: userId, expiresAt: 456, messageTimestamp: '456' },
        ],
        pdfIdentifier: '',
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
        reviewType: 'HackerRank',
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [
          { userId: '999', acceptedAt: expect.any(Number) },
          { userId, acceptedAt: expect.any(Number) },
        ],
        declinedReviewers: [
          { userId: '111', declinedAt: expect.any(Number) },
          { userId: '222', declinedAt: expect.any(Number) },
        ],
        pendingReviewers: [{ userId: '9208123', expiresAt: 123, messageTimestamp: '123' }],
        pdfIdentifier: '',
      });
    });
  });

  describe('expireRequest', () => {
    it('should expire the request and let the next user in line know', async () => {
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
        reviewType: 'HackerRank',
        candidateIdentifier: '',
        reviewersNeededCount: 2,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [{ userId: expiringUserId, expiresAt: 123, messageTimestamp: '1234' }],
        pdfIdentifier: '',
      };

      const nextReviewer: PartialPendingReviewer = {
        userId: userId,
        expiresAt: 929292,
      };

      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);
      QueueService.nextInLine = jest.fn().mockResolvedValue(nextReviewer);
      chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('123');
      reviewCloser.closeReviewIfComplete = jest.fn().mockResolvedValue(undefined);

      await expireRequest(app, review, expiringUserId);

      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        app.client,
        expiringUserId,
        '1234',
        expect.arrayContaining([
          expect.objectContaining({
            text: {
              text: 'The request has expired. You will keep your spot in the queue.',
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
        'HackerRank',
      );
      expect(reviewCloser.closeReviewIfComplete).toHaveBeenCalledWith(app, threadId);
    });
  });
});

function acceptedUser(userId: string): AcceptedReviewer {
  return { userId, acceptedAt: new Date().getTime() };
}

function declinedUser(userId: string): DeclinedReviewer {
  return { userId, declinedAt: new Date().getTime() };
}
