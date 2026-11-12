import { CandidateType, Deadline } from '@/bot/enums';
import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { chatService } from '@/services/ChatService';
import * as QueueService from '@/services/QueueService';
import { withdrawFromOtherReviews } from '@/services/RequestService';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';

const ACCEPTER = 'accepter';

describe('withdrawFromOtherReviews', () => {
  let app: App;
  let stored: Map<string, ActiveReview>;
  let nextInLine: jest.SpyInstance;

  function review(threadId: string, overrides: Partial<ActiveReview> = {}): ActiveReview {
    return {
      threadId,
      requestorId: 'recruiter',
      languages: ['Java'],
      requestedAt: new Date(),
      dueBy: Deadline.MONDAY,
      candidateIdentifier: '',
      candidateType: CandidateType.FULL_TIME,
      reviewersNeededCount: 1,
      acceptedReviewers: [],
      declinedReviewers: [],
      pendingReviewers: [
        { userId: ACCEPTER, expiresAt: 1, messageTimestamp: `${threadId}-ts` },
        { userId: 'other', expiresAt: 1, messageTimestamp: 'other-ts' },
      ],
      hackerRankUrl: '',
      yardstickUrl: '',
      ...overrides,
    };
  }

  function store(...reviews: ActiveReview[]) {
    stored = new Map(reviews.map(r => [r.threadId, structuredClone(r)] as const));
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    app = buildMockApp();
    store();

    activeReviewRepo.listAll = jest.fn(async () =>
      Array.from(stored.values(), r => structuredClone(r)),
    );
    activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn(async (id: string) => {
      const r = stored.get(id);
      return r && structuredClone(r);
    });
    activeReviewRepo.update = jest.fn(async (r: ActiveReview) => {
      stored.set(r.threadId, structuredClone(r));
      return r;
    });
    activeReviewRepo.remove = jest.fn(async (id: string) => {
      stored.delete(id);
    });
    chatService.updateDirectMessage = jest.fn();
    chatService.replyToReviewThread = jest.fn();
    chatService.sendRequestReviewMessage = jest.fn().mockResolvedValue('next-ts');
    nextInLine = jest.spyOn(QueueService, 'nextInLine').mockResolvedValue(undefined);
  });

  it('withdraws the teammate from every other review they are pending on', async () => {
    store(review('accepted'), review('B'), review('C'));

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    for (const threadId of ['B', 'C']) {
      const r = stored.get(threadId)!;
      expect(r.pendingReviewers.map(p => p.userId)).toEqual(['other']);
      expect(r.declinedReviewers.map(d => d.userId)).toEqual([ACCEPTER]);
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        app.client,
        ACCEPTER,
        `${threadId}-ts`,
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              text: expect.stringContaining('You accepted another review'),
            }),
          }),
        ]),
      );
    }
    // The review they accepted is left alone
    expect(stored.get('accepted')!.pendingReviewers.map(p => p.userId)).toContain(ACCEPTER);
  });

  it('leaves reviews they are not pending on alone', async () => {
    store(review('accepted'), review('B', { pendingReviewers: [] }));

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    expect(activeReviewRepo.update).not.toHaveBeenCalled();
    expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
  });

  it('asks the next person in line in their place', async () => {
    store(review('B'));
    nextInLine.mockResolvedValueOnce({ userId: 'next', expiresAt: 99 });

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    expect(stored.get('B')!.pendingReviewers.map(p => p.userId)).toEqual(['other', 'next']);
  });

  it('closes a review as unfulfilled when they were the last one pending and nobody is left', async () => {
    store(
      review('B', {
        pendingReviewers: [{ userId: ACCEPTER, expiresAt: 1, messageTimestamp: 'B-ts' }],
      }),
    );

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'B',
      expect.stringContaining('No more potential reviewers are available'),
    );
    expect(stored.has('B')).toBe(false);
  });

  it('skips a review that closed after it was listed', async () => {
    store(review('B'));
    const listed = await activeReviewRepo.listAll();
    activeReviewRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored.clear();

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
  });

  it('keeps going when one review fails', async () => {
    store(review('B'), review('C'));
    chatService.updateDirectMessage = jest
      .fn()
      .mockRejectedValueOnce(new Error('slack down'))
      .mockResolvedValue(undefined);
    chatService.postBlocksMessage = jest.fn().mockResolvedValue({});

    await withdrawFromOtherReviews(app, ACCEPTER, 'accepted');

    expect(chatService.postBlocksMessage).toHaveBeenCalled();
    expect(stored.get('C')!.declinedReviewers.map(d => d.userId)).toEqual([ACCEPTER]);
  });
});
