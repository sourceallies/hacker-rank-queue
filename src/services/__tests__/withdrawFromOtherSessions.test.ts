import { CandidateType, InterviewFormat } from '@/bot/enums';
import { PairingSession, PairingSlot } from '@/database/models/PairingSession';
import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import * as PairingQueueService from '@/services/PairingQueueService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';

const BOOKED = 'booked';

function slot(id: string, interested: string[]): PairingSlot {
  return {
    id,
    date: '2026-03-31',
    startTime: '09:00',
    endTime: '12:00',
    interestedTeammates: interested.map(userId => ({
      userId,
      acceptedAt: 1,
      formats: [InterviewFormat.REMOTE],
    })),
  };
}

describe('pairingRequestService.withdrawFromOtherSessions', () => {
  let app: App;
  let stored: Map<string, PairingSession>;
  let nextInLine: jest.SpyInstance;

  function session(threadId: string, overrides: Partial<PairingSession> = {}): PairingSession {
    return {
      threadId,
      requestorId: 'recruiter',
      candidateName: `Candidate ${threadId}`,
      languages: ['Java'],
      format: InterviewFormat.REMOTE,
      candidateType: CandidateType.FULL_TIME,
      availabilityWindows: [],
      slots: [slot('s1', [])],
      requestedAt: new Date(),
      teammatesNeededCount: 2,
      pendingTeammates: [{ userId: 'other', expiresAt: 1, messageTimestamp: 'other-ts' }],
      declinedTeammates: [],
      ...overrides,
    };
  }

  function store(...sessions: PairingSession[]) {
    stored = new Map(sessions.map(s => [s.threadId, structuredClone(s)] as const));
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    app = buildMockApp();
    store();

    pairingSessionsRepo.listAll = jest.fn(async () =>
      Array.from(stored.values(), s => structuredClone(s)),
    );
    const read = async (id: string) => {
      const s = stored.get(id);
      return s && structuredClone(s);
    };
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn(read);
    pairingSessionsRepo.getByThreadIdOrFail = jest.fn(async (id: string) => (await read(id))!);
    pairingSessionsRepo.update = jest.fn(async (s: PairingSession) => {
      stored.set(s.threadId, structuredClone(s));
      return s;
    });
    pairingSessionsRepo.remove = jest.fn(async (id: string) => {
      stored.delete(id);
    });
    chatService.updateDirectMessage = jest.fn();
    chatService.sendDirectMessage = jest.fn();
    chatService.replyToReviewThread = jest.fn();
    nextInLine = jest
      .spyOn(PairingQueueService, 'nextInLineForPairing')
      .mockResolvedValue(undefined);
    jest.spyOn(pairingRequestService, 'sendTeammateDM').mockResolvedValue('next-ts');
  });

  const interestedIn = (threadId: string) =>
    stored.get(threadId)!.slots.flatMap(s => s.interestedTeammates.map(t => t.userId));

  it('removes an unanswered offer and updates that DM', async () => {
    store(
      session('B', {
        pendingTeammates: [
          { userId: BOOKED, expiresAt: 1, messageTimestamp: 'B-ts' },
          { userId: 'other', expiresAt: 1, messageTimestamp: 'other-ts' },
        ],
      }),
    );

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED], 'A');

    const b = stored.get('B')!;
    expect(b.pendingTeammates.map(t => t.userId)).toEqual(['other']);
    expect(b.declinedTeammates.map(t => t.userId)).toEqual([BOOKED]);
    expect(chatService.updateDirectMessage).toHaveBeenCalledWith(app.client, BOOKED, 'B-ts', [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "You're booked on another pairing session, so we've taken you off *Candidate B*'s session.",
        },
      },
    ]);
  });

  it('removes slots they already picked and tells them in a new DM', async () => {
    store(session('B', { slots: [slot('s1', [BOOKED, 'x']), slot('s2', [BOOKED])] }));

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED], 'A');

    expect(interestedIn('B')).toEqual(['x']);
    expect(stored.get('B')!.declinedTeammates.map(t => t.userId)).toEqual([BOOKED]);
    expect(chatService.sendDirectMessage).toHaveBeenCalledWith(
      app.client,
      BOOKED,
      expect.stringContaining("You're booked on another pairing session"),
    );
  });

  it('asks the next person in line in their place', async () => {
    store(session('B', { slots: [slot('s1', [BOOKED])] }));
    nextInLine.mockResolvedValueOnce({ userId: 'next', expiresAt: 1 });

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED], 'A');

    expect(stored.get('B')!.pendingTeammates.map(t => t.userId)).toEqual(['other', 'next']);
  });

  it('withdraws every booked teammate, from every other session', async () => {
    store(
      session('A', { slots: [slot('s1', [BOOKED, 'partner'])] }),
      session('B', { slots: [slot('s1', [BOOKED, 'partner'])] }),
      session('C', {
        pendingTeammates: [{ userId: 'partner', expiresAt: 1, messageTimestamp: 'C-ts' }],
      }),
    );

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED, 'partner'], 'A');

    expect(interestedIn('A')).toEqual([BOOKED, 'partner']);
    expect(interestedIn('B')).toEqual([]);
    expect(stored.has('C')).toBe(false); // partner was the last pending and nobody was left
  });

  it('closes a session as unfulfilled when they were the last one pending and nobody is left', async () => {
    store(
      session('B', {
        pendingTeammates: [{ userId: BOOKED, expiresAt: 1, messageTimestamp: 'B-ts' }],
      }),
    );

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED], 'A');

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'B',
      expect.stringContaining("Couldn't fill all slots"),
    );
    expect(stored.has('B')).toBe(false);
  });

  it('does nothing when nobody was booked', async () => {
    store(session('B', { slots: [slot('s1', [BOOKED])] }));

    await pairingRequestService.withdrawFromOtherSessions(app, [], 'A');

    expect(pairingSessionsRepo.listAll).not.toHaveBeenCalled();
  });

  it('keeps going when one session fails', async () => {
    store(
      session('B', { slots: [slot('s1', [BOOKED])] }),
      session('C', { slots: [slot('s1', [BOOKED])] }),
    );
    chatService.sendDirectMessage = jest
      .fn()
      .mockRejectedValueOnce(new Error('slack down'))
      .mockResolvedValue(undefined);
    chatService.postBlocksMessage = jest.fn().mockResolvedValue({});

    await pairingRequestService.withdrawFromOtherSessions(app, [BOOKED], 'A');

    expect(chatService.postBlocksMessage).toHaveBeenCalled();
    expect(interestedIn('C')).toEqual([]);
  });
});
