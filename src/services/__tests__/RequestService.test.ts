import { ActiveReview, PartialPendingReviewer } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { Deadline } from '@bot/enums';
import { RequestService, QueueService } from '@/services';
import { chatService } from '@/services/ChatService';
import { expireRequest } from '@/services/RequestService';
import { buildMockWebClient } from '@utils/slackMocks';

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
        reviewersNeededCount: 2,
        acceptedReviewers: ['999'],
        declinedReviewers: ['111', '222'],
        pendingReviewers: [{ userId: '9208123', expiresAt: 123, messageTimestamp: '123' }],
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
        reviewersNeededCount: 2,
        acceptedReviewers: ['999'],
        declinedReviewers: ['111', '222'],
        pendingReviewers: [
          { userId: '9208123', expiresAt: 123, messageTimestamp: '123' },
          { userId: userId, expiresAt: 456, messageTimestamp: '456' },
        ],
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
        reviewersNeededCount: 2,
        acceptedReviewers: ['999', userId],
        declinedReviewers: ['111', '222'],
        pendingReviewers: [{ userId: '9208123', expiresAt: 123, messageTimestamp: '123' }],
      });
    });
  });

  describe('expireRequest', () => {
    it('should expire the request and let the next user in line know', async () => {
      const userId = '0239482';
      const expiringUserId = '9208123';
      const threadId = '123';
      const client = buildMockWebClient();
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: '456',
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.END_OF_DAY,
        reviewersNeededCount: 2,
        acceptedReviewers: [],
        declinedReviewers: [],
        pendingReviewers: [{ userId: expiringUserId, expiresAt: 123, messageTimestamp: '1234' }],
      };

      const nextReviewer: PartialPendingReviewer = {
        userId: userId,
        expiresAt: 929292,
      };

      activeReviewRepo.update = jest.fn().mockResolvedValue(undefined);
      QueueService.nextInLine = jest.fn().mockResolvedValue(nextReviewer);
      chatService.updateMessage = jest.fn().mockResolvedValue(undefined);
      chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('123');

      await expireRequest(client, review, expiringUserId);

      expect(chatService.updateMessage).toHaveBeenCalledWith(
        client,
        expiringUserId,
        '1234',
        expect.arrayContaining([
          expect.objectContaining({
            elements: [
              {
                emoji: true,
                text: 'The request has expired. You will keep your spot in the queue.',
                type: 'plain_text',
              },
            ],
          }),
        ]),
      );

      expect(activeReviewRepo.update).toHaveBeenCalledWith({
        ...review,
        pendingReviewers: [{ ...nextReviewer, messageTimestamp: '123' }],
        declinedReviewers: [expiringUserId],
      });

      expect(chatService.sendRequestReviewMessage).toHaveBeenCalledWith(
        client,
        userId,
        threadId,
        { id: review.requestorId },
        review.languages,
        'End of day',
      );
    });
  });
});
