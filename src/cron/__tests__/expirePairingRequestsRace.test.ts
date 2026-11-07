import { pickPairingTimes } from '@bot/pickPairingTimes';
import { CandidateType, InterviewFormat } from '@bot/enums';
import { PairingSession } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { serializeMeta, snapshotOf } from '@utils/pairingPicker';
import { slotsFromWindows } from '@utils/pairingSlots';
import { buildMockApp, buildMockWebClient } from '@utils/slackMocks';
import { expirePairingRequests } from '../expirePairingRequests';

const THREAD_ID = 'thread-1';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('expirePairingRequests racing a time submission on the same session', () => {
  let stored: PairingSession;

  beforeEach(() => {
    jest.restoreAllMocks();
    const windows = [{ date: '2026-03-31', startTime: '13:00', endTime: '17:00' }];
    stored = {
      threadId: THREAD_ID,
      requestorId: 'recruiter-1',
      candidateName: 'Dana',
      languages: ['Python'],
      format: InterviewFormat.REMOTE,
      candidateType: CandidateType.FULL_TIME,
      requestedAt: new Date('2026-03-30'),
      teammatesNeededCount: 2,
      availabilityWindows: windows,
      slots: slotsFromWindows(windows, 3),
      pendingTeammates: [
        { userId: 'expired', expiresAt: Date.now() - 1000, messageTimestamp: 'dm-1' },
        { userId: 'picker', expiresAt: Date.now() + 100000, messageTimestamp: 'dm-2' },
      ],
      declinedTeammates: [],
    };

    const read = async () => structuredClone(stored);
    pairingSessionsRepo.listAll = jest.fn(async () => [await read()]);
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn(read);
    pairingSessionsRepo.getByThreadIdOrFail = jest.fn(read);
    pairingSessionsRepo.update = jest.fn(async (session: PairingSession) => {
      stored = structuredClone(session);
      return session;
    });

    userRepo.find = jest
      .fn()
      .mockResolvedValue({ id: 'picker', formats: [InterviewFormat.REMOTE] });
    chatService.updateDirectMessage = jest.fn();
    pairingSessionCloser.closeIfComplete = jest.fn().mockResolvedValue(false);
    pairingRequestService.requestNextTeammate = jest.fn();
    pickPairingTimes.app = buildMockApp();
  });

  it('keeps picks that land while the cron is expiring another teammate', async () => {
    let releaseExpire!: () => void;
    const expireGate = new Promise<void>(resolve => (releaseExpire = resolve));
    let markExpireStarted!: () => void;
    const expireStarted = new Promise<void>(resolve => (markExpireStarted = resolve));

    // Mimics declineTeammate: slow Slack calls, then saves its copy of the session
    jest
      .spyOn(pairingRequestService, 'declineTeammate')
      .mockImplementation(async (_app, session, userId) => {
        markExpireStarted();
        await expireGate;
        const updated = {
          ...session,
          pendingTeammates: session.pendingTeammates.filter(t => t.userId !== userId),
          declinedTeammates: [...session.declinedTeammates, { userId, declinedAt: 0 }],
        };
        await pairingSessionsRepo.update(updated);
        return updated;
      });

    const submit = {
      client: buildMockWebClient(),
      ack: jest.fn(),
      body: {
        user: { id: 'picker' },
        view: {
          private_metadata: serializeMeta({
            threadId: THREAD_ID,
            dmTs: 'dm-2',
            candidateName: stored.candidateName,
            languages: stored.languages,
            format: stored.format,
            slots: snapshotOf(stored),
            selected: [0],
          }),
        },
      },
    };

    const cron = expirePairingRequests(buildMockApp());
    await expireStarted;
    const picks = pickPairingTimes.submitTimes(submit as any);
    await flush();
    releaseExpire();
    await Promise.all([cron, picks]);

    expect(stored.slots[0].interestedTeammates.map(t => t.userId)).toEqual(['picker']);
    expect(stored.pendingTeammates).toEqual([]);
    expect(stored.declinedTeammates.map(t => t.userId)).toEqual(['expired']);
  });
});
