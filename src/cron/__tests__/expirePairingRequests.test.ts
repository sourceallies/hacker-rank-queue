import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { pairingRequestService } from '@/services/PairingRequestService';
import { PairingSession } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { App } from '@slack/bolt';
import { expirePairingRequests } from '../expirePairingRequests';

Date.now = jest.fn();
const nowMock = jest.mocked(Date.now);
nowMock.mockReturnValue(1000000);

function makeInterview(nextExpandAt: number): PairingSession {
  return {
    threadId: Math.random().toString(),
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Java'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    slots: [],
    pendingTeammates: [],
    declinedTeammates: [],
    nextExpandAt,
  };
}

const mockError = Error('mock error');

describe('expirePairingRequests', () => {
  let expandTeammates: jest.SpyInstance;
  let app: App;

  const interview1 = makeInterview(Date.now() - 10); // expired
  const interview2 = makeInterview(Date.now() + 50); // not yet
  const interview3 = makeInterview(Date.now() - 1000); // expired
  const interview4 = makeInterview(Date.now()); // exact match — not expired (strict >)

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

    expandTeammates = jest
      .spyOn(pairingRequestService, 'expandTeammates')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(undefined);

    const allInterviews = [interview1, interview2, interview3, interview4];
    pairingSessionsRepo.listAll = jest.fn().mockResolvedValue(allInterviews);

    await expirePairingRequests(app);
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('should check all pairing sessions', () => {
    expect(pairingSessionsRepo.listAll).toHaveBeenCalled();
  });

  it('should expand only the sessions whose nextExpandAt has passed', () => {
    expect(expandTeammates).toHaveBeenCalledWith(expect.anything(), interview1);
    expect(expandTeammates).toHaveBeenCalledWith(expect.anything(), interview3);
    expect(expandTeammates).not.toHaveBeenCalledWith(expect.anything(), interview2);
  });

  it('should not expand a session whose nextExpandAt is exactly now', () => {
    expect(expandTeammates).not.toHaveBeenCalledWith(expect.anything(), interview4);
  });

  it('should not stop when a single request fails', () => {
    expect(expandTeammates).toHaveBeenCalledTimes(2);
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
