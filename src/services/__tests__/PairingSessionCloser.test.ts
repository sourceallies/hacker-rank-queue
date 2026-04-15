import { PairingSession, PairingSlot } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { pairingSessionCloser, findConfirmedSlots } from '../PairingSessionCloser';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';
import { reviewLockManager } from '@utils/reviewLockManager';
import { userRepo } from '@repos/userRepo';

function makeSlot(overrides: Partial<PairingSlot> = {}): PairingSlot {
  return {
    id: 'slot-1',
    date: '2026-03-31',
    startTime: '13:00',
    endTime: '15:00',
    interestedTeammates: [],
    ...overrides,
  };
}

function makeInterview(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    slots: [],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingSessionCloser', () => {
  let app: App;

  beforeEach(() => {
    app = buildMockApp();
    chatService.replyToReviewThread = jest.fn().mockResolvedValue(undefined);
    pairingSessionsRepo.remove = jest.fn().mockResolvedValue(undefined);
    pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn();
    reviewLockManager.releaseLock = jest.fn();
    userRepo.markNowAsLastReviewedDate = jest.fn().mockResolvedValue(undefined);
    userRepo.markNowAsLastPairingReviewedDate = jest.fn().mockResolvedValue(undefined);
  });

  describe('findConfirmedSlots', () => {
    it('should return empty array when no slot has 2 interested teammates', () => {
      const slot = makeSlot({
        interestedTeammates: [{ userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] }],
      });
      const interview = makeInterview({ slots: [slot] });

      expect(findConfirmedSlots(interview)).toEqual([]);
    });

    it('should return confirmed slots for remote interviews', () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.REMOTE, slots: [slot] });

      expect(findConfirmedSlots(interview)).toEqual([slot]);
    });

    it('should return all confirmed slots when multiple qualify', () => {
      const slot1 = makeSlot({
        id: 'slot-1',
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const slot2 = makeSlot({
        id: 'slot-2',
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.REMOTE, slots: [slot1, slot2] });

      expect(findConfirmedSlots(interview)).toEqual([slot1, slot2]);
    });

    it('should return confirmed slots for in-person interviews', () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.IN_PERSON] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.IN_PERSON, slots: [slot] });

      expect(findConfirmedSlots(interview)).toEqual([slot]);
    });

    describe('hybrid interviews', () => {
      it('should NOT confirm a slot where both teammates are remote-only', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlots(interview)).toEqual([]);
      });

      it('should confirm a slot where at least 1 teammate is in-person capable', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlots(interview)).toEqual([slot]);
      });

      it('should confirm a slot where both teammates are in-person capable', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.IN_PERSON] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlots(interview)).toEqual([slot]);
      });
    });
  });

  describe('closeIfComplete', () => {
    it('should not close when no confirmed slot exists but teammates are still pending', async () => {
      const slot = makeSlot({
        interestedTeammates: [{ userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] }],
      });
      const interview = makeInterview({
        slots: [slot],
        pendingTeammates: [
          { userId: 'pending-1', expiresAt: Date.now() + 60000, messageTimestamp: 'ts-1' },
        ],
      });
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingSessionCloser.closeIfComplete(app, 'thread-1');

      expect(pairingSessionsRepo.remove).not.toHaveBeenCalled();
    });

    it('should close and notify when a slot is confirmed', async () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.REMOTE, slots: [slot] });
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingSessionCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        'thread-1',
        expect.stringContaining('Mar 31'),
      );
      expect(userRepo.markNowAsLastPairingReviewedDate).toHaveBeenCalledWith('u1');
      expect(userRepo.markNowAsLastPairingReviewedDate).toHaveBeenCalledWith('u2');
      expect(pairingSessionsRepo.remove).toHaveBeenCalledWith('thread-1');
      expect(reviewLockManager.releaseLock).toHaveBeenCalledWith('thread-1');
    });

    it('should close as unfulfilled when no pending teammates remain and no slot confirmed', async () => {
      const interview = makeInterview({
        pendingTeammates: [],
        slots: [makeSlot({ interestedTeammates: [] })],
      });
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingSessionCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        'thread-1',
        expect.stringContaining('No teammates signed up'),
      );
      expect(pairingSessionsRepo.remove).toHaveBeenCalledWith('thread-1');
      expect(reviewLockManager.releaseLock).toHaveBeenCalledWith('thread-1');
    });

    it('should list partial sign-ups when unfulfilled but some teammates were interested', async () => {
      const slot1 = makeSlot({
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [{ userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] }],
      });
      const slot2 = makeSlot({
        id: 'slot-2',
        date: '2026-04-01',
        startTime: '10:00',
        endTime: '12:00',
        interestedTeammates: [],
      });
      const slot3 = makeSlot({
        id: 'slot-3',
        date: '2026-04-02',
        startTime: '14:00',
        endTime: '16:00',
        interestedTeammates: [
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
          { userId: 'u3', acceptedAt: 3, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({
        format: InterviewFormat.HYBRID,
        pendingTeammates: [],
        slots: [slot1, slot2, slot3],
      });
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingSessionCloser.closeIfComplete(app, 'thread-1');

      const message = (chatService.replyToReviewThread as jest.Mock).mock.calls[0][2];
      expect(message).toContain("Couldn't fill all slots");
      expect(message).toContain('Some teammates did sign up');
      expect(message).toContain('<@u1>');
      expect(message).toContain('<@u2>');
      expect(message).toContain('<@u3>');
      expect(message).not.toContain('Apr 01');
      expect(pairingSessionsRepo.remove).toHaveBeenCalledWith('thread-1');
      expect(reviewLockManager.releaseLock).toHaveBeenCalledWith('thread-1');
    });

    it('should handle a concurrently-closed interview gracefully', async () => {
      pairingSessionsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);

      await pairingSessionCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
    });
  });
});
