import { CandidateType, InterviewFormat } from '@bot/enums';
import { InterestedTeammate, PairingSession, PairingSlot } from '@models/PairingSession';
import {
  confirmedSlots,
  decline,
  involvedTeammateIds,
  isUnfulfilled,
  respond,
  slotKey,
  standingOf,
} from '../pairingSessionRules';

const REMOTE = InterviewFormat.REMOTE;
const IN_PERSON = InterviewFormat.IN_PERSON;
const HYBRID = InterviewFormat.HYBRID;
const NOW = 5000;

function interested(userId: string, formats: InterviewFormat[] = [REMOTE]): InterestedTeammate {
  return { userId, acceptedAt: 1, formats };
}

function makeSlot(startTime: string, interestedTeammates: InterestedTeammate[] = []): PairingSlot {
  return {
    id: `slot-${startTime}`,
    date: '2026-03-31',
    startTime,
    endTime: '23:00',
    interestedTeammates,
  };
}

function makeSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    teammatesNeededCount: 2,
    availabilityWindows: [],
    slots: [makeSlot('09:00'), makeSlot('13:00')],
    pendingTeammates: [{ userId: 'u2', expiresAt: 9999999, messageTimestamp: 'ts-2' }],
    declinedTeammates: [],
    ...overrides,
  };
}

/** One slot, with u2 pending, picking it. */
function pickOnlySlot(
  session: Partial<PairingSession>,
  formats: InterviewFormat[],
): ReturnType<typeof respond> {
  const s = makeSession({ slots: [makeSlot('09:00')], ...session });
  return respond(s, { userId: 'u2', formats }, [slotKey(s.slots[0])], NOW);
}

describe('pairingSessionRules', () => {
  describe('respond', () => {
    it('adds the teammate to each picked slot, and only those', () => {
      const session = makeSession();

      const response = respond(
        session,
        { userId: 'u2', formats: [REMOTE] },
        ['2026-03-31T09:00'],
        NOW,
      );

      expect(response.outcome).toBe('recorded');
      if (response.outcome !== 'recorded') return;
      expect(response.session.slots[0].interestedTeammates).toEqual([
        { userId: 'u2', acceptedAt: NOW, formats: [REMOTE] },
      ]);
      expect(response.session.slots[1].interestedTeammates).toEqual([]);
      expect(response.recorded.map(s => s.startTime)).toEqual(['09:00']);
    });

    it('matches picks by date and start time, whatever order the slots are in', () => {
      const session = makeSession({ slots: [makeSlot('13:00'), makeSlot('09:00')] });

      const response = respond(
        session,
        { userId: 'u2', formats: [REMOTE] },
        ['2026-03-31T09:00'],
        NOW,
      );

      if (response.outcome !== 'recorded') throw new Error('expected recorded');
      expect(response.recorded.map(s => s.id)).toEqual(['slot-09:00']);
    });

    it('removes the teammate from pending', () => {
      const response = pickOnlySlot({}, [REMOTE]);

      if (response.outcome !== 'recorded') throw new Error('expected recorded');
      expect(response.session.pendingTeammates).toEqual([]);
    });

    it('records only the picked slots with room, and says which', () => {
      const full = makeSlot('09:00', [interested('a'), interested('b')]);
      const session = makeSession({ slots: [full, makeSlot('13:00')] });

      const response = respond(
        session,
        { userId: 'u2', formats: [REMOTE] },
        [slotKey(full), '2026-03-31T13:00'],
        NOW,
      );

      if (response.outcome !== 'recorded') throw new Error('expected recorded');
      expect(response.recorded.map(s => s.startTime)).toEqual(['13:00']);
      expect(response.session.slots[0].interestedTeammates.map(t => t.userId)).toEqual(['a', 'b']);
    });

    it('is all-covered when every picked slot is full', () => {
      const response = pickOnlySlot(
        { teammatesNeededCount: 1, slots: [makeSlot('09:00', [interested('u1')])] },
        [REMOTE],
      );

      expect(response).toEqual({ outcome: 'all-covered' });
    });

    it('does not change the session it was given', () => {
      const session = makeSession();
      const before = structuredClone(session);

      respond(session, { userId: 'u2', formats: [REMOTE] }, ['2026-03-31T09:00'], NOW);

      expect(session).toEqual(before);
    });

    it('throws for a teammate who is not pending', () => {
      expect(() =>
        respond(makeSession(), { userId: 'nobody', formats: [REMOTE] }, [], NOW),
      ).toThrow('nobody');
    });

    describe('hybrid sessions', () => {
      it('holds the last seat for someone in person when nobody in person has joined', () => {
        const slots = [makeSlot('09:00', [interested('u1', [REMOTE])])];

        expect(pickOnlySlot({ format: HYBRID, slots }, [REMOTE]).outcome).toBe('all-covered');
        expect(pickOnlySlot({ format: HYBRID, slots }, [IN_PERSON]).outcome).toBe('recorded');
      });

      it('takes a remote teammate into the last seat once someone in person has joined', () => {
        const slots = [makeSlot('09:00', [interested('u1', [IN_PERSON])])];

        expect(pickOnlySlot({ format: HYBRID, slots }, [REMOTE]).outcome).toBe('recorded');
      });

      it('takes anyone while more than one seat is open', () => {
        expect(pickOnlySlot({ format: HYBRID }, [REMOTE]).outcome).toBe('recorded');
      });

      it('takes nobody once the slot is full', () => {
        const slots = [makeSlot('09:00', [interested('u1', [IN_PERSON])])];

        expect(
          pickOnlySlot({ format: HYBRID, teammatesNeededCount: 1, slots }, [IN_PERSON]).outcome,
        ).toBe('all-covered');
      });
    });
  });

  describe('confirmedSlots', () => {
    it('confirms a slot once it has enough teammates', () => {
      const ready = makeSlot('09:00', [interested('a'), interested('b')]);
      const session = makeSession({ slots: [ready, makeSlot('13:00', [interested('a')])] });

      expect(confirmedSlots(session)).toEqual([ready]);
    });

    it('returns every confirmed slot', () => {
      const slots = [
        makeSlot('09:00', [interested('a'), interested('b')]),
        makeSlot('13:00', [interested('a'), interested('b')]),
      ];

      expect(confirmedSlots(makeSession({ slots }))).toEqual(slots);
    });

    it('confirms in-person sessions the same way', () => {
      const slots = [
        makeSlot('09:00', [interested('a', [IN_PERSON]), interested('b', [IN_PERSON])]),
      ];

      expect(confirmedSlots(makeSession({ format: IN_PERSON, slots }))).toEqual(slots);
    });

    it.each([
      ['both remote', [REMOTE], [REMOTE], false],
      ['one in person', [IN_PERSON], [REMOTE], true],
      ['both in person', [IN_PERSON], [IN_PERSON], true],
    ])('hybrid, %s', (_label, a, b, expected) => {
      const slots = [makeSlot('09:00', [interested('a', a), interested('b', b)])];

      expect(confirmedSlots(makeSession({ format: HYBRID, slots })).length > 0).toBe(expected);
    });
  });

  // The seat rule and the confirm rule used to live in two files, written as opposite checks.
  // Starting from an empty hybrid slot, this lets teammates of each format join in every order the
  // seat rule allows, and checks every slot it reaches: confirmed exactly when it takes nobody.
  describe('seat and confirm rules agree', () => {
    const formatsList = [[REMOTE], [IN_PERSON]];

    function reachableSlots(needed: number): InterestedTeammate[][] {
      const seen: InterestedTeammate[][] = [];
      const queue: InterestedTeammate[][] = [[]];
      while (queue.length > 0) {
        const already = queue.shift()!;
        seen.push(already);
        for (const formats of formatsList) {
          const response = pickOnlySlot(
            { format: HYBRID, teammatesNeededCount: needed, slots: [makeSlot('09:00', already)] },
            formats,
          );
          if (response.outcome === 'recorded') {
            queue.push(
              response.session.slots[0].interestedTeammates.map((t, i) => ({
                ...t,
                userId: `t${i}`,
              })),
            );
          }
        }
      }
      return seen;
    }

    it.each([1, 2, 3])('with %i teammates needed', needed => {
      const reached = reachableSlots(needed);

      for (const already of reached) {
        const session: Partial<PairingSession> = {
          format: HYBRID,
          teammatesNeededCount: needed,
          slots: [makeSlot('09:00', already)],
        };
        const confirmed = confirmedSlots(makeSession(session)).length > 0;
        const takesAnyone = formatsList.some(f => pickOnlySlot(session, f).outcome === 'recorded');

        expect({ already, confirmed }).toEqual({ already, confirmed: !takesAnyone });
      }
      // And the seat rule never fills a slot with nobody in person.
      expect(
        reached.some(
          slots => slots.length === needed && slots.every(t => !t.formats.includes(IN_PERSON)),
        ),
      ).toBe(false);
    });
  });

  describe('decline', () => {
    it('moves the teammate from pending to declined and returns their pending entry', () => {
      const result = decline(makeSession(), 'u2', NOW);

      expect(result.session.pendingTeammates).toEqual([]);
      expect(result.session.declinedTeammates).toEqual([{ userId: 'u2', declinedAt: NOW }]);
      expect(result.declined.messageTimestamp).toBe('ts-2');
    });

    it('throws for a teammate who is not pending', () => {
      expect(() => decline(makeSession(), 'nobody', NOW)).toThrow('nobody');
    });
  });

  describe('isUnfulfilled', () => {
    it('is true when nobody is pending and no slot is confirmed', () => {
      expect(isUnfulfilled(makeSession({ pendingTeammates: [] }))).toBe(true);
    });

    it('is false while someone is still pending', () => {
      expect(isUnfulfilled(makeSession())).toBe(false);
    });

    it('is false when a slot is confirmed', () => {
      const slots = [makeSlot('09:00', [interested('a'), interested('b')])];

      expect(isUnfulfilled(makeSession({ pendingTeammates: [], slots }))).toBe(false);
    });
  });

  describe('standingOf and involvedTeammateIds', () => {
    const session = makeSession({
      pendingTeammates: [{ userId: 'pending', expiresAt: 1, messageTimestamp: 't' }],
      declinedTeammates: [{ userId: 'declined', declinedAt: 1 }],
      slots: [makeSlot('09:00', [interested('picked')])],
    });

    it.each([
      ['pending', 'pending'],
      ['declined', 'responded'],
      ['picked', 'responded'],
      ['stranger', 'setting-up'],
    ])('%s is %s', (userId, expected) => {
      expect(standingOf(session, userId)).toBe(expected);
    });

    it('is gone when the session no longer exists', () => {
      expect(standingOf(undefined, 'pending')).toBe('gone');
    });

    it('counts pending, declined and picked teammates as involved', () => {
      expect(Array.from(involvedTeammateIds(session)).sort()).toEqual([
        'declined',
        'pending',
        'picked',
      ]);
    });
  });
});
