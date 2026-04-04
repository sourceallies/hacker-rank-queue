import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestService } from '../PairingRequestService';
import { buildMockApp } from '@utils/slackMocks';
import { PairingInterview, PairingSlot } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';
import { App } from '@slack/bolt';
import * as PairingQueueService from '../PairingQueueService';

function makeInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
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
    app = buildMockApp();
    pairingInterviewsRepo.update = jest.fn().mockImplementation(async i => i);
    pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
  });

  describe('declineTeammate', () => {
    it('should move teammate from pending to declined and update their DM', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
      });

      jest.spyOn(PairingQueueService, 'nextInLineForPairing').mockResolvedValue(undefined);

      await pairingRequestService.declineTeammate(app, interview, 'u1', 'No thanks');

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingTeammates: [],
          declinedTeammates: expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]),
        }),
      );
    });

    it('should throw when the teammate is not in pending list', async () => {
      const interview = makeInterview({ pendingTeammates: [] });

      await expect(
        pairingRequestService.declineTeammate(app, interview, 'u1', 'msg'),
      ).rejects.toThrow('u1');
    });
  });

  describe('recordSlotSelections', () => {
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

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
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

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ pendingTeammates: [] }),
      );
    });
  });
});
