import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { CandidateType, Deadline } from '@/bot/enums';
import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { userRepo } from '@repos/userRepo';
import { RequestService } from '@/services';
import { chatService } from '@/services/ChatService';
import { reviewCloser } from '@/services/ReviewCloser';
import { buildMockActionParam, buildMockApp } from '@utils/slackMocks';
import { expireRequests } from '../expireRequests';

const THREAD_ID = '123';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('expireRequests racing an accept on the same review', () => {
  let stored: ActiveReview;

  beforeEach(() => {
    jest.restoreAllMocks();
    stored = {
      threadId: THREAD_ID,
      acceptedReviewers: [],
      dueBy: Deadline.MONDAY,
      candidateIdentifier: '',
      candidateType: CandidateType.FULL_TIME,
      languages: [],
      pendingReviewers: [
        { userId: 'expired', expiresAt: Date.now() - 1000, messageTimestamp: '1' },
        { userId: 'accepter', expiresAt: Date.now() + 100000, messageTimestamp: '2' },
      ],
      declinedReviewers: [],
      requestedAt: new Date(),
      requestorId: 'requester',
      reviewersNeededCount: 2,
      hackerRankUrl: '',
      yardstickUrl: '',
    };

    const read = async () => structuredClone(stored);
    activeReviewRepo.listAll = jest.fn(async () => [await read()]);
    activeReviewRepo.getReviewByThreadIdOrFail = jest.fn(read);
    activeReviewRepo.getReviewByThreadIdOrUndefined = jest.fn(read);
    activeReviewRepo.update = jest.fn(async (review: ActiveReview) => {
      stored = structuredClone(review);
      return review;
    });

    userRepo.markNowAsLastReviewedDate = jest.fn();
    chatService.replyToReviewThread = jest.fn();
    chatService.updateDirectMessage = jest.fn();
    reviewCloser.closeReviewIfComplete = jest.fn();
  });

  it('keeps an acceptance that lands while the cron is expiring another reviewer', async () => {
    let releaseExpire!: () => void;
    const expireGate = new Promise<void>(resolve => (releaseExpire = resolve));
    let markExpireStarted!: () => void;
    const expireStarted = new Promise<void>(resolve => (markExpireStarted = resolve));

    // Mimics moveOntoNextPerson: slow Slack/Sheets calls, then saves its copy of the review
    jest
      .spyOn(RequestService, 'expireRequest')
      .mockImplementation(async (_app, review, reviewerId) => {
        markExpireStarted();
        await expireGate;
        await activeReviewRepo.update({
          ...review,
          pendingReviewers: [
            ...review.pendingReviewers.filter(({ userId }) => userId !== reviewerId),
            { userId: 'next-in-line', expiresAt: Date.now() + 100000, messageTimestamp: '3' },
          ],
          declinedReviewers: [...review.declinedReviewers, { userId: reviewerId, declinedAt: 0 }],
        });
      });

    const app = buildMockApp();
    acceptReviewRequest.setup(app);
    const action = buildMockActionParam();
    action.body.user.id = 'accepter';
    action.body.actions = [{ value: THREAD_ID } as any];
    action.body.message!.ts = '2';

    const cron = expireRequests(app);
    await expireStarted;
    const accept = acceptReviewRequest.handleAccept(action);
    await flush();
    releaseExpire();
    await Promise.all([cron, accept]);

    expect(stored.acceptedReviewers.map(({ userId }) => userId)).toEqual(['accepter']);
    expect(stored.pendingReviewers.map(({ userId }) => userId)).toEqual(['next-in-line']);
    expect(stored.declinedReviewers.map(({ userId }) => userId)).toEqual(['expired']);
  });

  it('skips a reviewer who accepted after the cron listed reviews but before it got the lock', async () => {
    const expireRequest = jest.spyOn(RequestService, 'expireRequest').mockImplementation();

    let releaseListAll!: () => void;
    const listAllGate = new Promise<void>(resolve => (releaseListAll = resolve));
    let markListed!: () => void;
    const listed = new Promise<void>(resolve => (markListed = resolve));
    activeReviewRepo.listAll = jest.fn(async () => {
      const snapshot = structuredClone(stored);
      markListed();
      await listAllGate;
      return [snapshot];
    });

    const app = buildMockApp();
    acceptReviewRequest.setup(app);
    const action = buildMockActionParam();
    action.body.user.id = 'expired';
    action.body.actions = [{ value: THREAD_ID } as any];
    action.body.message!.ts = '1';

    const cron = expireRequests(app);
    await listed;
    await acceptReviewRequest.handleAccept(action);
    releaseListAll();
    await cron;

    expect(expireRequest).not.toHaveBeenCalled();
    expect(stored.acceptedReviewers.map(({ userId }) => userId)).toEqual(['expired']);
    expect(stored.pendingReviewers.map(({ userId }) => userId)).toEqual(['accepter']);
    expect(stored.declinedReviewers).toEqual([]);
  });
});
