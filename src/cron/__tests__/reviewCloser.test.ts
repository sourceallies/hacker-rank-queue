import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { chatService } from '@/services/ChatService';
import { ActiveReview } from '@models/ActiveReview';
import { Deadline } from '@bot/enums';
import { App } from '@slack/bolt';
import { reviewCloser } from '@cron/reviewCloser';
import { buildMockWebClient } from '@utils/slackMocks';

describe('reviewCloser', () => {
  let app: App;
  beforeEach(() => {
    app = {
      client: buildMockWebClient(),
    } as App;
    chatService.replyToReviewThread = jest.fn().mockResolvedValue(undefined);
    activeReviewRepo.remove = jest.fn().mockResolvedValue(undefined);
  });

  describe('closeReviews', () => {
    it('should close completed reviews', async () => {
      const threadId = '111';
      const requestorId = '123';
      const reviews: ActiveReview[] = [
        {
          threadId: threadId,
          requestorId: requestorId,
          languages: ['Java'],
          requestedAt: new Date(),
          dueBy: Deadline.MONDAY,
          reviewersNeededCount: 2,
          acceptedReviewers: ['A', 'B'],
          declinedReviewers: [],
          pendingReviewers: [],
          hackerRankUrl: 'https://www.example.org/1',
        },
        {
          threadId: '3932',
          requestorId: '019232',
          languages: ['Java', 'JavaScript'],
          requestedAt: new Date(),
          dueBy: Deadline.END_OF_DAY,
          reviewersNeededCount: 2,
          acceptedReviewers: ['C'],
          declinedReviewers: ['D', 'E'],
          pendingReviewers: [{ userId: 'F', expiresAt: 123, messageTimestamp: '123' }],
          hackerRankUrl: 'https://www.example.org/2',
        },
      ];
      activeReviewRepo.listAll = jest.fn().mockResolvedValue(reviews);

      await reviewCloser(app);

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
      const reviews: ActiveReview[] = [
        {
          threadId: threadId,
          requestorId: requestorId,
          languages: ['Java'],
          requestedAt: new Date(),
          dueBy: Deadline.MONDAY,
          reviewersNeededCount: 2,
          acceptedReviewers: ['B'],
          declinedReviewers: ['A', 'C', 'D', 'E'],
          pendingReviewers: [],
          hackerRankUrl: 'https://www.example.org',
        },
      ];
      activeReviewRepo.listAll = jest.fn().mockResolvedValue(reviews);

      await reviewCloser(app);

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        threadId,
        `<@${requestorId}> 1 of 2 needed reviewers found. No more potential reviewers are available.`,
      );
      expect(activeReviewRepo.remove).toHaveBeenCalledWith(threadId);
    });
  });
});
