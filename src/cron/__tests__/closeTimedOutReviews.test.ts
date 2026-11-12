import { CandidateType, Deadline } from '@/bot/enums';
import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { chatService } from '@/services/ChatService';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';
import { closeTimedOutReviews } from '../closeTimedOutReviews';

// Thursday, January 6th, 2022 at 3:00 PM. With 1 business day it closes Friday at 3:00 PM.
const REQUESTED_AT = new Date(2022, 0, 6, 15, 0);
const BEFORE_CLOSE = new Date(2022, 0, 7, 14, 59).getTime();
const AT_CLOSE = new Date(2022, 0, 7, 15, 0).getTime();

describe('closeTimedOutReviews', () => {
  let app: App;
  let stored: Map<string, ActiveReview>;

  function review(overrides: Partial<ActiveReview> = {}): ActiveReview {
    return {
      threadId: 'thread-1',
      requestorId: 'recruiter',
      languages: ['Java'],
      requestedAt: REQUESTED_AT,
      dueBy: Deadline.MONDAY,
      candidateIdentifier: '',
      candidateType: CandidateType.FULL_TIME,
      reviewersNeededCount: 2,
      acceptedReviewers: [{ userId: 'accepted', acceptedAt: 1 }],
      declinedReviewers: [],
      pendingReviewers: [
        { userId: 'pending-1', expiresAt: 1, messageTimestamp: 'ts-1' },
        { userId: 'pending-2', expiresAt: 1, messageTimestamp: 'ts-2' },
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
    process.env.WORKDAY_START_HOUR = '8';
    process.env.WORKDAY_END_HOUR = '17';
    delete process.env.REQUEST_CLOSE_BUSINESS_DAYS;
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
    chatService.replyToReviewThread = jest.fn();
    chatService.updateDirectMessage = jest.fn();
  });

  it('closes an unfilled review once it is past its close time', async () => {
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutReviews(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      '<@recruiter> 1 of 2 needed reviewers found. Closing after 1 business day.',
    );
    expect(activeReviewRepo.remove).toHaveBeenCalledWith('thread-1');
    expect(stored.has('thread-1')).toBe(false);
  });

  it('updates the DM of every teammate still pending', async () => {
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutReviews(app);

    expect(chatService.updateDirectMessage).toHaveBeenCalledTimes(2);
    for (const [userId, ts] of [
      ['pending-1', 'ts-1'],
      ['pending-2', 'ts-2'],
    ]) {
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        app.client,
        userId,
        ts,
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              text: expect.stringContaining('This request has closed without enough reviewers'),
            }),
          }),
        ]),
      );
    }
  });

  it('leaves a review open before its close time', async () => {
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_CLOSE);

    await closeTimedOutReviews(app);

    expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
    expect(activeReviewRepo.remove).not.toHaveBeenCalled();
  });

  it('ignores the review deadline', async () => {
    store(review({ dueBy: Deadline.END_OF_DAY }));
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_CLOSE);

    await closeTimedOutReviews(app);

    expect(activeReviewRepo.remove).not.toHaveBeenCalled();
  });

  it('uses REQUEST_CLOSE_BUSINESS_DAYS for the close time and message', async () => {
    process.env.REQUEST_CLOSE_BUSINESS_DAYS = '2';
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutReviews(app);
    expect(activeReviewRepo.remove).not.toHaveBeenCalled();

    // Monday, January 10th, 2022 at 3:00 PM
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2022, 0, 10, 15, 0).getTime());
    await closeTimedOutReviews(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      '<@recruiter> 1 of 2 needed reviewers found. Closing after 2 business days.',
    );
  });

  it('skips a review that filled after it was listed', async () => {
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);
    const listed = await activeReviewRepo.listAll();
    activeReviewRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored.get('thread-1')!.acceptedReviewers.push({ userId: 'late', acceptedAt: 2 });

    await closeTimedOutReviews(app);

    expect(activeReviewRepo.remove).not.toHaveBeenCalled();
  });

  it('skips a review that was closed after it was listed', async () => {
    store(review());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);
    const listed = await activeReviewRepo.listAll();
    activeReviewRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored.clear();

    await closeTimedOutReviews(app);

    expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
    expect(activeReviewRepo.remove).not.toHaveBeenCalled();
  });
});
