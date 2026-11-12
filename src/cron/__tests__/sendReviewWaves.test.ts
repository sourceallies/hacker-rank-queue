import { CandidateType, Deadline } from '@/bot/enums';
import { ActiveReview, PendingReviewer } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { withOfferedAt } from '@utils/offeredAt';
import { chatService } from '@/services/ChatService';
import * as QueueService from '@/services/QueueService';
import Time from '@utils/time';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';
import { sendReviewWaves } from '../sendReviewWaves';

const NOW = new Date(2022, 0, 6, 11, 0).getTime();

describe('sendReviewWaves', () => {
  let app: App;
  let stored: Map<string, ActiveReview>;
  let queue: string[];

  function review(overrides: Partial<ActiveReview> = {}): ActiveReview {
    return {
      threadId: 'thread-1',
      requestorId: 'recruiter',
      languages: ['Java'],
      requestedAt: new Date(NOW - Time.HOUR),
      dueBy: Deadline.MONDAY,
      candidateIdentifier: '',
      candidateType: CandidateType.FULL_TIME,
      reviewersNeededCount: 2,
      acceptedReviewers: [],
      declinedReviewers: [],
      pendingReviewers: [
        { userId: 'first', offeredAt: NOW - 30 * Time.MINUTE, messageTimestamp: '1' },
      ],
      hackerRankUrl: '',
      yardstickUrl: '',
      ...overrides,
    };
  }

  function store(...reviews: ActiveReview[]) {
    stored = new Map(reviews.map(r => [r.threadId, structuredClone(r)] as const));
  }

  const pendingIds = (threadId = 'thread-1') =>
    stored.get(threadId)?.pendingReviewers.map(p => p.userId);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    app = buildMockApp();
    process.env.NUMBER_OF_INITIAL_REVIEWERS = '2';
    delete process.env.WAVE_INTERVAL_MIN;
    queue = ['A', 'B', 'C'];
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
    chatService.sendRequestReviewMessage = jest
      .fn()
      .mockImplementation(async (_client, userId: string) => `ts-${userId}`);
    jest.spyOn(QueueService, 'nextInLine').mockImplementation(async (r: ActiveReview) => {
      const taken = new Set(r.pendingReviewers.map(p => p.userId));
      const userId = queue.find(id => !taken.has(id));
      return userId ? { userId, offeredAt: Date.now() } : undefined;
    });
  });

  it('sends the next wave once the newest offer is 30 minutes old', async () => {
    store(review());

    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['first', 'A', 'B']);
  });

  it('never takes back an open offer', async () => {
    store(review());

    await sendReviewWaves(app);

    expect(stored.get('thread-1')!.declinedReviewers).toEqual([]);
    expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
  });

  it('waits when the newest offer is younger than the interval', async () => {
    store(
      review({
        pendingReviewers: [
          { userId: 'old', offeredAt: NOW - 2 * Time.HOUR, messageTimestamp: '1' },
          { userId: 'new', offeredAt: NOW - 29 * Time.MINUTE, messageTimestamp: '2' },
        ],
      }),
    );

    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['old', 'new']);
  });

  it('uses WAVE_INTERVAL_MIN', async () => {
    process.env.WAVE_INTERVAL_MIN = '60';
    store(review());

    await sendReviewWaves(app);
    expect(pendingIds()).toEqual(['first']);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 30 * Time.MINUTE);
    await sendReviewWaves(app);
    expect(pendingIds()).toEqual(['first', 'A', 'B']);
  });

  it('keeps sending waves until the queue runs out', async () => {
    store(review());

    await sendReviewWaves(app);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 30 * Time.MINUTE);
    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['first', 'A', 'B', 'C']);
  });

  it('leaves the review open when the queue is empty but people are still pending', async () => {
    queue = [];
    store(review());

    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['first']);
    expect(activeReviewRepo.remove).not.toHaveBeenCalled();
  });

  it('closes as unfulfilled when nobody is pending and nobody is left in line', async () => {
    queue = [];
    store(review({ pendingReviewers: [], declinedReviewers: [{ userId: 'x', declinedAt: 1 }] }));

    await sendReviewWaves(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      expect.stringContaining('No more potential reviewers are available'),
    );
    expect(stored.has('thread-1')).toBe(false);
  });

  it('skips a review that got a fresh offer after it was listed', async () => {
    store(review());
    const listed = await activeReviewRepo.listAll();
    activeReviewRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored
      .get('thread-1')!
      .pendingReviewers.push({ userId: 'replacement', offeredAt: NOW, messageTimestamp: '9' });

    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['first', 'replacement']);
  });

  it('sends a wave straight away to a review with offers from before this change', async () => {
    // Old rows stored expiresAt; the repo maps them to offeredAt 0
    const legacy = withOfferedAt<PendingReviewer>({
      userId: 'first',
      expiresAt: NOW + Time.HOUR,
      messageTimestamp: '1',
    });
    store(review({ pendingReviewers: [legacy] }));

    await sendReviewWaves(app);

    expect(pendingIds()).toEqual(['first', 'A', 'B']);
  });
});

describe('withOfferedAt', () => {
  it('keeps offeredAt on new rows', () => {
    expect(withOfferedAt({ userId: 'a', offeredAt: 5, messageTimestamp: 't' })).toEqual({
      userId: 'a',
      offeredAt: 5,
      messageTimestamp: 't',
    });
  });

  it('maps old expiresAt rows to an offer sent long ago', () => {
    expect(withOfferedAt({ userId: 'a', expiresAt: 5, messageTimestamp: 't' })).toEqual({
      userId: 'a',
      offeredAt: 0,
      messageTimestamp: 't',
    });
  });
});
