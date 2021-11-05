import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { Deadline } from '@bot/enums';
import { RequestService } from '@/services';

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
        pendingReviewers: [{ userId: '9208123', expiresAt: 123 }],
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
          { userId: '9208123', expiresAt: 123 },
          { userId: userId, expiresAt: 456 },
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
        pendingReviewers: [{ userId: '9208123', expiresAt: 123 }],
      });
    });
  });
});
