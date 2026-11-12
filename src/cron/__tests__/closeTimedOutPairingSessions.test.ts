import { CandidateType, InterviewFormat } from '@/bot/enums';
import { PairingSession, PairingSlot } from '@/database/models/PairingSession';
import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';
import { closeTimedOutPairingSessions } from '../closeTimedOutPairingSessions';

// Thursday, January 6th, 2022 at 3:00 PM. With 1 business day it closes Friday at 3:00 PM.
const REQUESTED_AT = new Date(2022, 0, 6, 15, 0);
const BEFORE_CLOSE = new Date(2022, 0, 7, 14, 59).getTime();
const AT_CLOSE = new Date(2022, 0, 7, 15, 0).getTime();

function slot(id: string, interested: string[]): PairingSlot {
  return {
    id,
    date: '2022-01-12',
    startTime: '09:00',
    endTime: '12:00',
    interestedTeammates: interested.map(userId => ({
      userId,
      acceptedAt: 1,
      formats: [InterviewFormat.REMOTE],
    })),
  };
}

describe('closeTimedOutPairingSessions', () => {
  let app: App;
  let stored: Map<string, PairingSession>;

  function session(overrides: Partial<PairingSession> = {}): PairingSession {
    return {
      threadId: 'thread-1',
      requestorId: 'recruiter',
      candidateName: 'Dana',
      languages: ['Java'],
      format: InterviewFormat.REMOTE,
      candidateType: CandidateType.FULL_TIME,
      availabilityWindows: [],
      slots: [slot('s1', ['picker'])],
      requestedAt: REQUESTED_AT,
      teammatesNeededCount: 2,
      pendingTeammates: [
        { userId: 'pending-1', offeredAt: 1, messageTimestamp: 'ts-1' },
        { userId: 'pending-2', offeredAt: 1, messageTimestamp: 'ts-2' },
      ],
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
    process.env.WORKDAY_START_HOUR = '8';
    process.env.WORKDAY_END_HOUR = '17';
    delete process.env.REQUEST_CLOSE_BUSINESS_DAYS;
    store();

    pairingSessionsRepo.listAll = jest.fn(async () =>
      Array.from(stored.values(), s => structuredClone(s)),
    );
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn(async (id: string) => {
      const s = stored.get(id);
      return s && structuredClone(s);
    });
    pairingSessionsRepo.remove = jest.fn(async (id: string) => {
      stored.delete(id);
    });
    chatService.replyToReviewThread = jest.fn();
    chatService.updateDirectMessage = jest.fn();
  });

  it('closes a session without a confirmed slot once it is past its close time', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutPairingSessions(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      expect.stringContaining(
        "<@recruiter> Closing *Dana*'s pairing session after 1 business day without a confirmed slot.",
      ),
    );
    expect(stored.has('thread-1')).toBe(false);
  });

  it('lists the teammates who did pick slots', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutPairingSessions(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      expect.stringContaining('<@picker>'),
    );
  });

  it('updates the DM of every teammate still pending, removing the picker button', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutPairingSessions(app);

    for (const [userId, ts] of [
      ['pending-1', 'ts-1'],
      ['pending-2', 'ts-2'],
    ]) {
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(app.client, userId, ts, [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'The pairing session for *Dana* has closed. You will keep your spot in the queue.',
          },
        },
      ]);
    }
  });

  it('leaves a session open before its close time', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(BEFORE_CLOSE);

    await closeTimedOutPairingSessions(app);

    expect(pairingSessionsRepo.remove).not.toHaveBeenCalled();
  });

  it('uses REQUEST_CLOSE_BUSINESS_DAYS', async () => {
    process.env.REQUEST_CLOSE_BUSINESS_DAYS = '2';
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);

    await closeTimedOutPairingSessions(app);
    expect(pairingSessionsRepo.remove).not.toHaveBeenCalled();

    // Monday, January 10th, 2022 at 3:00 PM
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2022, 0, 10, 15, 0).getTime());
    await closeTimedOutPairingSessions(app);
    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      expect.stringContaining('after 2 business days'),
    );
  });

  it('skips a session that confirmed a slot after it was listed', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);
    const listed = await pairingSessionsRepo.listAll();
    pairingSessionsRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored.get('thread-1')!.slots = [slot('s1', ['picker', 'second'])];

    await closeTimedOutPairingSessions(app);

    expect(pairingSessionsRepo.remove).not.toHaveBeenCalled();
  });

  it('skips a session that was closed after it was listed', async () => {
    store(session());
    jest.spyOn(Date, 'now').mockReturnValue(AT_CLOSE);
    const listed = await pairingSessionsRepo.listAll();
    pairingSessionsRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored.clear();

    await closeTimedOutPairingSessions(app);

    expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
  });
});
