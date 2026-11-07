import { InterviewFormat } from '@bot/enums';
import { PairingSession, PairingSlot, PendingPairingTeammate } from '@models/PairingSession';

/**
 * The rules for how a pairing session changes. Pure: every function takes a session and returns a
 * new one or an answer about it. Callers save what comes back and send the Slack messages.
 *
 * See GLOSSARY.md for standing, slot, interested teammate, teammates needed and confirmed slot.
 */

export type Standing = 'pending' | 'responded' | 'gone' | 'setting-up';

export interface RespondingTeammate {
  userId: string;
  /** Their formats right now. Stored on each slot they land in, for the hybrid rule. */
  formats: InterviewFormat[];
}

export type Response =
  | {
      outcome: 'recorded';
      session: PairingSession;
      /** The picked slots that actually took them, which can be fewer than they picked. */
      recorded: PairingSlot[];
    }
  | {
      /**
       * Every slot they picked was already full. Treat this as a decline. Recording it would drop
       * them from pending without adding them anywhere, and the queue would offer them this same
       * session again.
       */
      outcome: 'all-covered';
    };

/**
 * A slot's identity is its date and start time. Matching on those, not on position or id, survives
 * a reordering of `session.slots` and works on the picker's snapshot.
 */
export function slotKey(slot: { date: string; startTime: string }): string {
  return `${slot.date}T${slot.startTime}`;
}

/**
 * A teammate who isn't pending isn't necessarily done with us.
 *
 * The session row is created before its DMs go out, so between the DM landing and pendingTeammates
 * being written there's a window where the teammate legitimately isn't on the list yet. That case
 * gets its own answer, 'setting-up', rather than being lumped in with 'gone'.
 *
 * A finished session is removed from the sheet outright, which is what makes 'gone' distinguishable.
 */
export function standingOf(session: PairingSession | undefined, userId: string): Standing {
  if (!session) return 'gone';
  if (session.pendingTeammates.some(t => t.userId === userId)) return 'pending';
  return involvedTeammateIds(session).has(userId) ? 'responded' : 'setting-up';
}

/** Everyone this session has already asked. The queue never offers it to them again. */
export function involvedTeammateIds(session: PairingSession): Set<string> {
  return new Set([
    ...session.pendingTeammates.map(t => t.userId),
    ...session.declinedTeammates.map(t => t.userId),
    ...session.slots.flatMap(s => s.interestedTeammates.map(t => t.userId)),
  ]);
}

/** A pending teammate's picks. Throws if they aren't pending. Check `standingOf` first. */
export function respond(
  session: PairingSession,
  teammate: RespondingTeammate,
  pickedSlotKeys: string[],
  now: number,
): Response {
  assertPending(session, teammate.userId);

  const picked = new Set(pickedSlotKeys);
  const recorded: PairingSlot[] = [];
  const slots = session.slots.map(slot => {
    if (!picked.has(slotKey(slot)) || !takes(seatsOf(session, slot), teammate)) return slot;

    const joined: PairingSlot = {
      ...slot,
      interestedTeammates: [
        ...slot.interestedTeammates,
        { userId: teammate.userId, acceptedAt: now, formats: teammate.formats },
      ],
    };
    recorded.push(joined);
    return joined;
  });

  if (recorded.length === 0) return { outcome: 'all-covered' };

  return {
    outcome: 'recorded',
    session: { ...session, slots, pendingTeammates: withoutPending(session, teammate.userId) },
    recorded,
  };
}

/** Moves a pending teammate to declined. Throws if they aren't pending. */
export function decline(
  session: PairingSession,
  userId: string,
  now: number,
): { session: PairingSession; declined: PendingPairingTeammate } {
  const declined = assertPending(session, userId);
  return {
    session: {
      ...session,
      pendingTeammates: withoutPending(session, userId),
      declinedTeammates: [...session.declinedTeammates, { userId, declinedAt: now }],
    },
    declined,
  };
}

/** Slots with enough teammates, and for hybrid at least one of them in person. */
export function confirmedSlots(session: PairingSession): PairingSlot[] {
  return session.slots.filter(slot => isConfirmed(seatsOf(session, slot)));
}

/** Nobody is left pending and no slot is confirmed, so the session can't fill. */
export function isUnfulfilled(session: PairingSession): boolean {
  return session.pendingTeammates.length === 0 && confirmedSlots(session).length === 0;
}

/**
 * The one place the seat and hybrid rules live. Both "can this teammate join?" and "is this slot
 * confirmed?" are read off it, so they can't disagree.
 */
interface Seats {
  open: number;
  /** Hybrid, and no in-person teammate on the slot yet. */
  needsInPerson: boolean;
}

function seatsOf(session: PairingSession, slot: PairingSlot): Seats {
  return {
    open: Math.max(0, session.teammatesNeededCount - slot.interestedTeammates.length),
    needsInPerson:
      session.format === InterviewFormat.HYBRID &&
      !slot.interestedTeammates.some(t => t.formats.includes(InterviewFormat.IN_PERSON)),
  };
}

function isConfirmed(seats: Seats): boolean {
  return seats.open === 0 && !seats.needsInPerson;
}

function takes(seats: Seats, teammate: RespondingTeammate): boolean {
  if (seats.open === 0) return false;
  // The last seat on a hybrid slot with nobody in person yet is held for someone in person.
  if (seats.needsInPerson && seats.open === 1) {
    return teammate.formats.includes(InterviewFormat.IN_PERSON);
  }
  return true;
}

function assertPending(session: PairingSession, userId: string): PendingPairingTeammate {
  const pending = session.pendingTeammates.find(t => t.userId === userId);
  if (!pending) {
    throw new Error(`${userId} is not pending on pairing session ${session.threadId}`);
  }
  return pending;
}

function withoutPending(session: PairingSession, userId: string): PendingPairingTeammate[] {
  return session.pendingTeammates.filter(t => t.userId !== userId);
}
