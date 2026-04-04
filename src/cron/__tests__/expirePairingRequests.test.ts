import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { pairingRequestService } from '@/services/PairingRequestService';
import { PairingInterview, PendingPairingTeammate } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';
import { App } from '@slack/bolt';
import { expirePairingRequests } from '../expirePairingRequests';

Date.now = jest.fn();
const nowMock = jest.mocked(Date.now);
nowMock.mockReturnValue(1000000);

function makeInterview(pendingTeammates: PendingPairingTeammate[]): PairingInterview {
  return {
    threadId: Math.random().toString(),
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Java'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    slots: [],
    pendingTeammates,
    declinedTeammates: [],
  };
}

function makePending(dateOffsetMs: number): PendingPairingTeammate {
  return {
    userId: Math.random().toString(),
    expiresAt: Date.now() + dateOffsetMs,
    messageTimestamp: '123',
  };
}

const mockError = Error('mock error');

describe('expirePairingRequests', () => {
  let declineTeammate: jest.SpyInstance;
  let app: App;

  const pending11 = makePending(+1);
  const pending12 = makePending(-10);
  const interview1 = makeInterview([pending11, pending12]);

  const pending21 = makePending(+50);
  const pending22 = makePending(+1);
  const interview2 = makeInterview([pending21, pending22]);

  const pending31 = makePending(-1000);
  const pending32 = makePending(-1);
  const pending33 = makePending(-5);
  const interview3 = makeInterview([pending31, pending32, pending33]);

  const pending41 = makePending(0);
  const interview4 = makeInterview([pending41]);

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

    declineTeammate = jest
      .spyOn(pairingRequestService, 'declineTeammate')
      .mockResolvedValueOnce(interview1)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(interview3)
      .mockResolvedValueOnce(interview3);

    const allInterviews = [interview1, interview2, interview3, interview4];
    pairingInterviewsRepo.listAll = jest.fn().mockResolvedValue(allInterviews);
    pairingInterviewsRepo.getByThreadIdOrUndefined = jest
      .fn()
      .mockImplementation((threadId: string) =>
        Promise.resolve(allInterviews.find(i => i.threadId === threadId)),
      );

    await expirePairingRequests(app);
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('should check all pairing interviews', () => {
    expect(pairingInterviewsRepo.listAll).toHaveBeenCalled();
  });

  it('should decline only the requests that have expired', () => {
    expect(declineTeammate).toHaveBeenCalledWith(
      expect.anything(),
      interview1,
      pending12.userId,
      expect.any(String),
    );
    expect(declineTeammate).toHaveBeenCalledWith(
      expect.anything(),
      interview3,
      pending31.userId,
      expect.any(String),
    );
    expect(declineTeammate).toHaveBeenCalledWith(
      expect.anything(),
      interview3,
      pending32.userId,
      expect.any(String),
    );
    expect(declineTeammate).toHaveBeenCalledWith(
      expect.anything(),
      interview3,
      pending33.userId,
      expect.any(String),
    );
  });

  it('should not expire requests that expire on this exact millisecond', () => {
    expect(declineTeammate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      pending41.userId,
      expect.any(String),
    );
  });

  it('should not stop when a single request fails', () => {
    expect(declineTeammate).toHaveBeenCalledTimes(4);
  });

  it('should notify the errors channel when there is a failure', () => {
    expect(app.client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: process.env.ERRORS_CHANNEL_ID,
      }),
    );
  });

  it('should skip teammates that are no longer pending (concurrent response)', async () => {
    const alreadyResponded = makePending(-500);
    const interviewWithResponded = makeInterview([alreadyResponded]);
    // Fresh fetch returns interview where this teammate has already been moved out of pending
    const freshWithoutTeammate = makeInterview([]);
    freshWithoutTeammate.threadId = interviewWithResponded.threadId;

    pairingInterviewsRepo.listAll = jest.fn().mockResolvedValue([interviewWithResponded]);
    pairingInterviewsRepo.getByThreadIdOrUndefined = jest
      .fn()
      .mockResolvedValue(freshWithoutTeammate);
    declineTeammate.mockClear();

    await expirePairingRequests(app);

    expect(declineTeammate).not.toHaveBeenCalled();
  });
});
