import { PairingSession, PairingSlot } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { chatService } from '@/services/ChatService';
import { App } from '@slack/bolt';
import { WebClient } from '@/slackTypes';
import { formatSlot, mention, ul } from '@utils/text';
import log from '@utils/log';

async function finalize(client: WebClient, threadId: string, message: string): Promise<void> {
  await chatService.replyToReviewThread(client, threadId, message);
  await pairingSessionsRepo.remove(threadId);
}

export function findConfirmedSlots(interview: PairingSession): PairingSlot[] {
  return interview.slots.filter(slot =>
    isSlotConfirmed(slot, interview.format, interview.teammatesNeededCount),
  );
}

export function isSlotConfirmed(
  slot: PairingSlot,
  format: InterviewFormat,
  teammatesNeededCount: number,
): boolean {
  if (slot.interestedTeammates.length < teammatesNeededCount) return false;

  if (format === InterviewFormat.HYBRID) {
    return slot.interestedTeammates.some(t => t.formats.includes(InterviewFormat.IN_PERSON));
  }

  return true;
}

/** Everyone on a confirmed slot: the teammates booked if this session closes now. */
export function teammatesOnConfirmedSlots(interview: PairingSession): string[] {
  const ids = findConfirmedSlots(interview).flatMap(s => s.interestedTeammates.map(t => t.userId));
  return Array.from(new Set(ids));
}

export const pairingSessionCloser = {
  /**
   * Returns true if the session was closed (or was already gone), false if it's still active.
   */
  async closeIfComplete(app: App, threadId: string): Promise<boolean> {
    const interview = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);

    if (!interview) {
      log.d('pairingSessionCloser', `Interview ${threadId} not found — likely already closed`);
      return true;
    }

    const confirmedSlots = findConfirmedSlots(interview);

    if (confirmedSlots.length > 0) {
      const teammates = Array.from(
        new Map(
          confirmedSlots
            .flatMap(s => s.interestedTeammates)
            .map(t => [t.userId, t] as [string, typeof t]),
        ).values(),
      );
      const slotLines = confirmedSlots.map(s => formatSlot(s.date, s.startTime, s.endTime));
      const message =
        `${mention({ id: interview.requestorId })} Pairing session for *${interview.candidateName}* is ready to schedule!\n\n` +
        `*Teammates:* ${teammates.map(t => mention({ id: t.userId })).join(', ')}\n\n` +
        `*Available slots (${confirmedSlots.length}):*\n${ul(...slotLines)}`;
      await Promise.all(teammates.map(t => userRepo.markNowAsLastPairingReviewedDate(t.userId)));
      await finalize(app.client, threadId, message);
      return true;
    }

    const isUnfulfilled = interview.pendingTeammates.length === 0;

    if (isUnfulfilled) {
      await finalize(
        app.client,
        threadId,
        unfulfilledMessage(
          interview,
          `Couldn't fill all slots for *${interview.candidateName}*'s pairing session.`,
        ),
      );
      return true;
    }

    return false;
  },

  /**
   * Closes a session that ran out of time without a confirmed slot. Callers must hold the
   * session's per-thread lock and pass the fresh copy they read under it.
   */
  async closeUnfilledAfterTimeout(
    app: App,
    interview: PairingSession,
    businessDays: number,
  ): Promise<void> {
    for (const pending of interview.pendingTeammates) {
      await chatService.updateDirectMessage(app.client, pending.userId, pending.messageTimestamp, [
        { type: 'section', text: { type: 'mrkdwn', text: timedOutDM(interview) } },
      ]);
    }
    const days = businessDays === 1 ? '1 business day' : `${businessDays} business days`;
    await finalize(
      app.client,
      interview.threadId,
      unfulfilledMessage(
        interview,
        `Closing *${interview.candidateName}*'s pairing session after ${days} without a confirmed slot.`,
      ),
    );
  },
};

function timedOutDM(interview: PairingSession): string {
  return `The pairing session for *${interview.candidateName}* has closed. You will keep your spot in the queue.`;
}

/** The recruiter's note when a session closes unfilled, listing anyone who did pick slots. */
function unfulfilledMessage(interview: PairingSession, headline: string): string {
  const header = `${mention({ id: interview.requestorId })} ${headline}`;
  const slotsWithInterest = interview.slots.filter(s => s.interestedTeammates.length > 0);
  if (slotsWithInterest.length === 0) return `${header} No teammates signed up.`;
  return (
    `${header}\n\n` +
    `Some teammates did sign up — you may be able to reach out to them directly:\n` +
    ul(
      ...slotsWithInterest.map(
        s =>
          `${formatSlot(s.date, s.startTime, s.endTime)} — ${s.interestedTeammates
            .map(t => mention({ id: t.userId }))
            .join(', ')}`,
      ),
    )
  );
}
