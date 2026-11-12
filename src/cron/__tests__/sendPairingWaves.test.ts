import { CandidateType, InterviewFormat } from '@/bot/enums';
import { PairingSession, PendingPairingTeammate } from '@/database/models/PairingSession';
import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import * as PairingQueueService from '@/services/PairingQueueService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { withOfferedAt } from '@utils/offeredAt';
import Time from '@utils/time';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';
import { sendPairingWaves } from '../sendPairingWaves';

const NOW = new Date(2022, 0, 6, 11, 0).getTime();

describe('sendPairingWaves', () => {
  let app: App;
  let stored: Map<string, PairingSession>;
  let queue: string[];

  function session(overrides: Partial<PairingSession> = {}): PairingSession {
    return {
      threadId: 'thread-1',
      requestorId: 'recruiter',
      candidateName: 'Dana',
      languages: ['Java'],
      format: InterviewFormat.REMOTE,
      candidateType: CandidateType.FULL_TIME,
      availabilityWindows: [],
      slots: [
        {
          id: 's1',
          date: '2022-01-12',
          startTime: '09:00',
          endTime: '12:00',
          interestedTeammates: [],
        },
      ],
      requestedAt: new Date(NOW - Time.HOUR),
      teammatesNeededCount: 2,
      pendingTeammates: [
        { userId: 'first', offeredAt: NOW - 30 * Time.MINUTE, messageTimestamp: '1' },
      ],
      declinedTeammates: [],
      ...overrides,
    };
  }

  function store(...sessions: PairingSession[]) {
    stored = new Map(sessions.map(s => [s.threadId, structuredClone(s)] as const));
  }

  const pendingIds = (threadId = 'thread-1') =>
    stored.get(threadId)?.pendingTeammates.map(t => t.userId);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    app = buildMockApp();
    process.env.NUMBER_OF_INITIAL_REVIEWERS = '2';
    delete process.env.WAVE_INTERVAL_MIN;
    queue = ['A', 'B', 'C'];
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
    chatService.replyToReviewThread = jest.fn();
    chatService.updateDirectMessage = jest.fn();
    jest
      .spyOn(pairingRequestService, 'sendTeammateDM')
      .mockImplementation(async (_app, userId: string) => `ts-${userId}`);
    jest
      .spyOn(PairingQueueService, 'nextInLineForPairing')
      .mockImplementation(async (s: PairingSession) => {
        const taken = new Set(s.pendingTeammates.map(t => t.userId));
        const userId = queue.find(id => !taken.has(id));
        return userId ? { userId, offeredAt: Date.now(), messageTimestamp: '' } : undefined;
      });
  });

  it('sends the next wave once the newest offer is 30 minutes old', async () => {
    store(session());

    await sendPairingWaves(app);

    expect(pendingIds()).toEqual(['first', 'A', 'B']);
    expect(stored.get('thread-1')!.pendingTeammates[1]).toEqual({
      userId: 'A',
      offeredAt: NOW,
      messageTimestamp: 'ts-A',
    });
  });

  it('never takes back an open offer', async () => {
    store(session());

    await sendPairingWaves(app);

    expect(stored.get('thread-1')!.declinedTeammates).toEqual([]);
    expect(chatService.updateDirectMessage).not.toHaveBeenCalled();
  });

  it('waits when the newest offer is younger than the interval', async () => {
    store(
      session({
        pendingTeammates: [
          { userId: 'new', offeredAt: NOW - 29 * Time.MINUTE, messageTimestamp: '2' },
        ],
      }),
    );

    await sendPairingWaves(app);

    expect(pendingIds()).toEqual(['new']);
  });

  it('uses WAVE_INTERVAL_MIN', async () => {
    process.env.WAVE_INTERVAL_MIN = '60';
    store(session());

    await sendPairingWaves(app);
    expect(pendingIds()).toEqual(['first']);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 30 * Time.MINUTE);
    await sendPairingWaves(app);
    expect(pendingIds()).toEqual(['first', 'A', 'B']);
  });

  it('leaves the session open when the queue is empty but people are still pending', async () => {
    queue = [];
    store(session());

    await sendPairingWaves(app);

    expect(pendingIds()).toEqual(['first']);
    expect(pairingSessionsRepo.remove).not.toHaveBeenCalled();
  });

  it('closes as unfulfilled when nobody is pending and nobody is left in line', async () => {
    queue = [];
    store(session({ pendingTeammates: [] }));

    await sendPairingWaves(app);

    expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
      app.client,
      'thread-1',
      expect.stringContaining("Couldn't fill all slots"),
    );
    expect(stored.has('thread-1')).toBe(false);
  });

  it('skips a session that got a fresh offer after it was listed', async () => {
    store(session());
    const listed = await pairingSessionsRepo.listAll();
    pairingSessionsRepo.listAll = jest.fn().mockResolvedValue(listed);
    stored
      .get('thread-1')!
      .pendingTeammates.push({ userId: 'replacement', offeredAt: NOW, messageTimestamp: '9' });

    await sendPairingWaves(app);

    expect(pendingIds()).toEqual(['first', 'replacement']);
  });

  it('sends a wave straight away to a session with offers from before this change', async () => {
    // Old rows stored expiresAt; the repo maps them to offeredAt 0
    const legacy = withOfferedAt<PendingPairingTeammate>({
      userId: 'first',
      expiresAt: NOW + Time.HOUR,
      messageTimestamp: '1',
    });
    store(session({ pendingTeammates: [legacy] }));

    await sendPairingWaves(app);

    expect(pendingIds()).toEqual(['first', 'A', 'B']);
  });
});
