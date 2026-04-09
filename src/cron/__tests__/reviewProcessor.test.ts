import { CandidateType, Deadline } from '@/bot/enums';
import { ActiveReview } from '@/database/models/ActiveReview';
import { activeReviewRepo } from '@/database/repos/activeReviewsRepo';
import { RequestService } from '@/services';
import { App } from '@slack/bolt';
import { expireRequests } from '../expireRequests';

Date.now = jest.fn();
const nowMock = jest.mocked(Date.now);
nowMock.mockReturnValue(1000000);

function mockReview(nextExpandAt: number): ActiveReview {
  return {
    threadId: Math.random().toString(),
    acceptedReviewers: [],
    dueBy: Deadline.MONDAY,
    candidateIdentifier: '',
    candidateType: CandidateType.FULL_TIME,
    languages: [],
    pendingReviewers: [],
    declinedReviewers: [],
    requestedAt: new Date(),
    requestorId: 'some-id',
    reviewersNeededCount: 2,
    nextExpandAt,
    hackerRankUrl: '',
    yardstickUrl: '',
  };
}

const mockError = Error('mock error');

describe('Review Processor', () => {
  let expandRequest: jest.SpyInstance;
  let app: App;

  const review1 = mockReview(Date.now() - 10); // expired
  const review2 = mockReview(Date.now() + 50); // not yet
  const review3 = mockReview(Date.now() - 1000); // expired
  const review4 = mockReview(Date.now()); // exact match — not expired (strict >)

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.ERRORS_CHANNEL_ID = 'some-errors-channel';
    nowMock.mockReturnValue(1000000);
    app = {
      client: {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ts: '100' }) as any,
        },
      },
    } as App;
    expandRequest = jest
      .spyOn(RequestService, 'expandRequest')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(undefined);

    const activeReviews = [review1, review2, review3, review4];
    activeReviewRepo.listAll = jest.fn().mockResolvedValue(activeReviews);

    await expireRequests(app);
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('should check all the reviews', () => {
    expect(activeReviewRepo.listAll).toHaveBeenCalled();
  });

  it('should expand only the reviews whose nextExpandAt has passed', () => {
    expect(expandRequest).toHaveBeenCalledWith(expect.anything(), review1);
    expect(expandRequest).toHaveBeenCalledWith(expect.anything(), review3);
    expect(expandRequest).not.toHaveBeenCalledWith(expect.anything(), review2);
  });

  it('should not expand a review whose nextExpandAt is exactly now', () => {
    expect(expandRequest).not.toHaveBeenCalledWith(expect.anything(), review4);
  });

  it('should not stop when a single request fails', () => {
    expect(expandRequest).toHaveBeenCalledTimes(2);
  });

  it('should notify the errors channel when there is a failure', () => {
    expect(app.client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: process.env.ERRORS_CHANNEL_ID,
      }),
    );
  });
});
