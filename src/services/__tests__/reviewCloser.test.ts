import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { chatService } from '@/services/ChatService';
import { AcceptedReviewer, ActiveReview, DeclinedReviewer } from '@models/ActiveReview';
import { Deadline } from '@bot/enums';
import { App } from '@slack/bolt';
import { buildMockApp } from '@utils/slackMocks';
import { reviewCloser } from '@/services/ReviewCloser';

jest.mock('@/services/RequestService', () => ({
  ...jest.requireActual('@/services/RequestService'),
  closeRequest: jest.fn(),
}));

import { closeRequest } from '@/services/RequestService';

describe('reviewCloser', () => {
  let app: App;
  beforeEach(() => {
    app = buildMockApp();
    chatService.replyToReviewThread = jest.fn().mockResolvedValue(undefined);
    activeReviewRepo.remove = jest.fn().mockResolvedValue(undefined);
  });

  describe('closeReviewIfComplete', () => {
    it('should close a completed review', async () => {
      const threadId = '111';
      const requestorId = '123';
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: requestorId,
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.MONDAY,
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('A'), acceptedUser('B')],
        declinedReviewers: [],
        pendingReviewers: [],
        hackerRankUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValue(review);

      await reviewCloser.closeReviewIfComplete(app, threadId);

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        threadId,
        `<@${requestorId}> all 2 reviewers have been found!`,
      );
      expect(activeReviewRepo.remove).toHaveBeenCalledWith(threadId);
    });

    it('should close unfulfilled reviews', async () => {
      const threadId = '111';
      const requestorId = '123';
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: requestorId,
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.MONDAY,
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('B')],
        declinedReviewers: [
          declinedUser('A'),
          declinedUser('C'),
          declinedUser('D'),
          declinedUser('E'),
        ],
        pendingReviewers: [],
        hackerRankUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValue(review);

      await reviewCloser.closeReviewIfComplete(app, threadId);

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        threadId,
        `<@${requestorId}> 1 of 2 needed reviewers found. No more potential reviewers are available.`,
      );
      expect(activeReviewRepo.remove).toHaveBeenCalledWith(threadId);
    });

    it('should not close a review if there are still pending reviewers', async () => {
      const threadId = '111';
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: '123',
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.MONDAY,
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('A')],
        declinedReviewers: [],
        pendingReviewers: [{ userId: '123', expiresAt: 1, messageTimestamp: '456' }],
        hackerRankUrl: '',
      };
      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValue(review);

      await reviewCloser.closeReviewIfComplete(app, threadId);

      expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
      expect(activeReviewRepo.remove).not.toHaveBeenCalled();
    });

    it('should call expireRequest for all pending reviewers before closing the review', async () => {
      const threadId = '111';
      const requestorId = '123';
      const pendingReviewers = [
        { userId: '123', expiresAt: 1, messageTimestamp: '456' },
        { userId: '456', expiresAt: 2, messageTimestamp: '789' },
      ];
      const review: ActiveReview = {
        threadId: threadId,
        requestorId: requestorId,
        languages: ['Java'],
        requestedAt: new Date(),
        dueBy: Deadline.MONDAY,
        candidateIdentifier: 'some-id',
        reviewersNeededCount: 2,
        acceptedReviewers: [acceptedUser('A'), acceptedUser('B')],
        declinedReviewers: [],
        pendingReviewers: pendingReviewers,
        hackerRankUrl: '',
      };

      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValue(review);

      await reviewCloser.closeReviewIfComplete(app, threadId);

      expect(closeRequest).toHaveBeenCalledTimes(pendingReviewers.length);
      pendingReviewers.forEach(pendingReviewer => {
        expect(closeRequest).toHaveBeenCalledWith(app, review, pendingReviewer.userId);
      });

      // Verify the review is closed after expiring requests
      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        threadId,
        `<@${requestorId}> all 2 reviewers have been found!`,
      );
      expect(activeReviewRepo.remove).toHaveBeenCalledWith(threadId);
    });

    it('should gracefully handle when review has already been closed by concurrent action', async () => {
      const threadId = '111';
      activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);

      await reviewCloser.closeReviewIfComplete(app, threadId);

      expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
      expect(activeReviewRepo.remove).not.toHaveBeenCalled();
      expect(closeRequest).not.toHaveBeenCalled();
    });
  });
});

function acceptedUser(userId: string): AcceptedReviewer {
  return { userId, acceptedAt: new Date().getTime() };
}

function declinedUser(userId: string): DeclinedReviewer {
  return { userId, declinedAt: new Date().getTime() };
}
