import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '../PairingRequestService';
import { buildMockApp } from '@utils/slackMocks';
import { PairingSession, PairingSlot } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { App } from '@slack/bolt';
import * as PairingQueueService from '../PairingQueueService';

function makeInterview(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingRequestService', () => {
  let app: App;

  beforeEach(() => {
    jest.restoreAllMocks();
    app = buildMockApp();
    pairingSessionsRepo.update = jest.fn().mockImplementation(async i => i);
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
  });

  describe('declineTeammate', () => {
    it('should move teammate from pending to declined and update their DM', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
      });

      jest.spyOn(PairingQueueService, 'nextInLineForPairing').mockResolvedValue(undefined);

      await pairingRequestService.declineTeammate(app, interview, 'u1', 'No thanks');

      expect(pairingSessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingTeammates: [],
          declinedTeammates: expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]),
        }),
      );
      expect(chatService.updateDirectMessage).toHaveBeenCalledWith(
        app.client,
        'u1',
        'ts-1',
        expect.any(Array),
      );
    });

    it('should throw when the teammate is not in pending list', async () => {
      const interview = makeInterview({ pendingTeammates: [] });

      await expect(
        pairingRequestService.declineTeammate(app, interview, 'u1', 'msg'),
      ).rejects.toThrow('u1');
    });
  });

  describe('requestNextTeammate', () => {
    it('should send DM to next teammate and add them to pendingTeammates', async () => {
      const interview = makeInterview();
      const nextPending = { userId: 'next-user', expiresAt: 9999, messageTimestamp: '' };
      jest.spyOn(PairingQueueService, 'nextInLineForPairing').mockResolvedValue(nextPending);
      jest.spyOn(pairingRequestService, 'sendTeammateDM').mockResolvedValue('ts-next');
      pairingSessionsRepo.getByThreadIdOrFail = jest.fn().mockResolvedValue(interview);

      await pairingRequestService.requestNextTeammate(app, interview);

      expect(pairingRequestService.sendTeammateDM).toHaveBeenCalledWith(
        app,
        'next-user',
        interview,
      );
      expect(pairingSessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingTeammates: expect.arrayContaining([
            expect.objectContaining({ userId: 'next-user', messageTimestamp: 'ts-next' }),
          ]),
        }),
      );
    });
  });

  describe('sendTeammateDM', () => {
    it('should post a DM and return the message timestamp', async () => {
      const interview = makeInterview();
      chatService.getDirectMessageId = jest.fn().mockResolvedValue('DM-123');
      (app.client.chat.postMessage as jest.Mock).mockResolvedValue({ ts: 'msg-ts-1' });

      const ts = await pairingRequestService.sendTeammateDM(app, 'teammate-1', interview);

      expect(chatService.getDirectMessageId).toHaveBeenCalledWith(app.client, 'teammate-1');
      expect(app.client.chat.postMessage).toHaveBeenCalled();
      expect(ts).toBe('msg-ts-1');
    });
  });

  describe('recordSlotSelections', () => {
    it('should not add teammate to a non-hybrid slot that is already at capacity', async () => {
      const interview = makeInterview({
        format: InterviewFormat.REMOTE,
        teammatesNeededCount: 1,
        pendingTeammates: [{ userId: 'u2', expiresAt: 9999999, messageTimestamp: 'ts-2' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [
              { userId: 'u1', acceptedAt: 1000, formats: [InterviewFormat.REMOTE] },
            ],
          },
        ],
      });

      const result = await pairingRequestService.recordSlotSelections(
        interview,
        'u2',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(result.slots[0].interestedTeammates).toHaveLength(1);
      expect(result.slots[0].interestedTeammates[0].userId).toBe('u1');
    });

    it('should not add a remote-only teammate to a hybrid slot at capacity that has no in-person yet', async () => {
      const interview = makeInterview({
        format: InterviewFormat.HYBRID,
        teammatesNeededCount: 1,
        pendingTeammates: [{ userId: 'u2', expiresAt: 9999999, messageTimestamp: 'ts-2' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [
              { userId: 'u1', acceptedAt: 1000, formats: [InterviewFormat.REMOTE] },
            ],
          },
        ],
      });

      const result = await pairingRequestService.recordSlotSelections(
        interview,
        'u2',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(result.slots[0].interestedTeammates).toHaveLength(1);
      expect(result.slots[0].interestedTeammates[0].userId).toBe('u1');
    });

    it('should add an in-person teammate to a hybrid slot at capacity that has no in-person yet', async () => {
      const interview = makeInterview({
        format: InterviewFormat.HYBRID,
        teammatesNeededCount: 1,
        pendingTeammates: [{ userId: 'u2', expiresAt: 9999999, messageTimestamp: 'ts-2' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [
              { userId: 'u1', acceptedAt: 1000, formats: [InterviewFormat.REMOTE] },
            ],
          },
        ],
      });

      const result = await pairingRequestService.recordSlotSelections(
        interview,
        'u2',
        ['slot-1'],
        [InterviewFormat.IN_PERSON],
      );

      expect(result.slots[0].interestedTeammates).toHaveLength(2);
      expect(result.slots[0].interestedTeammates[1].userId).toBe('u2');
    });

    it('should not add a teammate to a hybrid slot that is already confirmed (has in-person)', async () => {
      const interview = makeInterview({
        format: InterviewFormat.HYBRID,
        teammatesNeededCount: 1,
        pendingTeammates: [{ userId: 'u3', expiresAt: 9999999, messageTimestamp: 'ts-3' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [
              { userId: 'u1', acceptedAt: 1000, formats: [InterviewFormat.IN_PERSON] },
            ],
          },
        ],
      });

      const result = await pairingRequestService.recordSlotSelections(
        interview,
        'u3',
        ['slot-1'],
        [InterviewFormat.IN_PERSON],
      );

      expect(result.slots[0].interestedTeammates).toHaveLength(1);
      expect(result.slots[0].interestedTeammates[0].userId).toBe('u1');
    });

    it('should add the teammate to interestedTeammates on each selected slot', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [],
          },
          {
            id: 'slot-2',
            date: '2026-03-31',
            startTime: '13:00',
            endTime: '15:00',
            interestedTeammates: [],
          },
        ],
      });

      await pairingRequestService.recordSlotSelections(
        interview,
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(pairingSessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: expect.arrayContaining([
            expect.objectContaining({
              id: 'slot-1',
              interestedTeammates: expect.arrayContaining([
                expect.objectContaining({ userId: 'u1' }),
              ]),
            }),
            expect.objectContaining({
              id: 'slot-2',
              interestedTeammates: [],
            }),
          ]),
        }),
      );
    });

    it('should remove the teammate from pendingTeammates after recording', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
      });

      await pairingRequestService.recordSlotSelections(
        interview,
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(pairingSessionsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ pendingTeammates: [] }),
      );
    });
  });
});
