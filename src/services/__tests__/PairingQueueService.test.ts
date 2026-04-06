import { User } from '@models/User';
import { InterviewFormat, InterviewType } from '@bot/enums';
import {
  filterUsersForPairing,
  getInitialUsersForPairingSession,
  nextInLineForPairing,
} from '../PairingQueueService';
import { userRepo } from '@repos/userRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { PairingSession } from '@models/PairingSession';
import { CandidateType } from '@bot/enums';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-' + Math.random(),
    name: 'Test User',
    languages: ['Python'],
    lastReviewedDate: undefined,
    lastPairingReviewedDate: undefined,
    interviewTypes: [InterviewType.PAIRING],
    formats: [InterviewFormat.REMOTE, InterviewFormat.IN_PERSON],
    ...overrides,
  };
}

function makePairingSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    slots: [],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingQueueService', () => {
  describe('filterUsersForPairing', () => {
    it('should exclude users who do not have pairing in their interviewTypes', () => {
      const hackerRankOnly = makeUser({ interviewTypes: [InterviewType.HACKERRANK] });
      const pairingUser = makeUser({ interviewTypes: [InterviewType.PAIRING] });

      const result = filterUsersForPairing(
        [hackerRankOnly, pairingUser],
        ['Python'],
        InterviewFormat.REMOTE,
      );

      expect(result).not.toContain(hackerRankOnly);
      expect(result).toContain(pairingUser);
    });

    it('should exclude users whose languages do not match', () => {
      const pythonUser = makeUser({ languages: ['Python'] });
      const javaUser = makeUser({ languages: ['Java'] });

      const result = filterUsersForPairing(
        [pythonUser, javaUser],
        ['Python'],
        InterviewFormat.REMOTE,
      );

      expect(result).toContain(pythonUser);
      expect(result).not.toContain(javaUser);
    });

    describe('format filtering', () => {
      const remoteOnlyUser = makeUser({ formats: [InterviewFormat.REMOTE] });
      const inPersonUser = makeUser({ formats: [InterviewFormat.IN_PERSON] });
      const bothUser = makeUser({ formats: [InterviewFormat.REMOTE, InterviewFormat.IN_PERSON] });

      it('should allow any user for remote interviews', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.REMOTE,
        );
        expect(result).toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });

      it('should only allow in-person users for in-person interviews', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.IN_PERSON,
        );
        expect(result).not.toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });

      it('should allow any user for hybrid interviews (close logic enforces constraint)', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.HYBRID,
        );
        expect(result).toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });
    });
  });

  describe('getInitialUsersForPairingSession', () => {
    beforeEach(() => {
      pairingSessionsRepo.listAll = jest.fn().mockResolvedValue([]);
    });

    it('should return the requested number of eligible users sorted by lastPairingReviewedDate', async () => {
      const user1 = makeUser({ id: 'u1', lastPairingReviewedDate: 100 });
      const user2 = makeUser({ id: 'u2', lastPairingReviewedDate: 200 });
      const user3 = makeUser({ id: 'u3', lastPairingReviewedDate: 300 });
      userRepo.listAll = jest.fn().mockResolvedValueOnce([user3, user2, user1]);

      const result = await getInitialUsersForPairingSession(['Python'], InterviewFormat.REMOTE, 2);

      expect(result).toEqual([user1, user2]);
    });

    it('should not include users who are already pending on another pairing session', async () => {
      const pendingUser = makeUser({ id: 'pending-user' });
      const freeUser = makeUser({ id: 'free-user', lastReviewedDate: 1 });
      userRepo.listAll = jest.fn().mockResolvedValueOnce([pendingUser, freeUser]);
      pairingSessionsRepo.listAll = jest.fn().mockResolvedValueOnce([
        makePairingSession({
          pendingTeammates: [
            { userId: 'pending-user', expiresAt: 9999999999, messageTimestamp: 't' },
          ],
        }),
      ]);

      const result = await getInitialUsersForPairingSession(['Python'], InterviewFormat.REMOTE, 2);

      expect(result).not.toContainEqual(expect.objectContaining({ id: 'pending-user' }));
      expect(result).toContainEqual(expect.objectContaining({ id: 'free-user' }));
    });
  });

  describe('nextInLineForPairing', () => {
    beforeEach(() => {
      pairingSessionsRepo.listAll = jest.fn().mockResolvedValue([]);
    });

    it('should return undefined when no eligible users remain', async () => {
      userRepo.listAll = jest.fn().mockResolvedValueOnce([]);
      const interview = makePairingSession();

      const result = await nextInLineForPairing(interview);

      expect(result).toBeUndefined();
    });

    it('should exclude users already pending, accepted (interested), or declined for this interview', async () => {
      const slotWithAccepted = {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [
          { userId: 'accepted-user', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
        ],
      };
      const interview = makePairingSession({
        slots: [slotWithAccepted],
        pendingTeammates: [{ userId: 'pending-user', expiresAt: 9999999, messageTimestamp: 't' }],
        declinedTeammates: [{ userId: 'declined-user', declinedAt: 1 }],
      });
      const eligibleUser = makeUser({ id: 'eligible-user' });
      userRepo.listAll = jest
        .fn()
        .mockResolvedValueOnce([
          makeUser({ id: 'accepted-user' }),
          makeUser({ id: 'pending-user' }),
          makeUser({ id: 'declined-user' }),
          eligibleUser,
        ]);

      const result = await nextInLineForPairing(interview);

      expect(result?.userId).toBe('eligible-user');
    });

    it('should exclude users who are pending on a different pairing session', async () => {
      const userPendingElsewhere = makeUser({ id: 'busy-user' });
      const freeUser = makeUser({ id: 'free-user' });
      userRepo.listAll = jest.fn().mockResolvedValueOnce([userPendingElsewhere, freeUser]);
      pairingSessionsRepo.listAll = jest.fn().mockResolvedValueOnce([
        makePairingSession({
          threadId: 'other-thread',
          pendingTeammates: [{ userId: 'busy-user', expiresAt: 9999999999, messageTimestamp: 't' }],
        }),
      ]);

      const interview = makePairingSession({ threadId: 'this-thread' });
      const result = await nextInLineForPairing(interview);

      expect(result?.userId).toBe('free-user');
    });
  });
});
