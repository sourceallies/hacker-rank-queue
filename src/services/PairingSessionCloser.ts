import { PairingSession, PairingSlot } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { chatService } from '@/services/ChatService';
import { App } from '@slack/bolt';
import { mention, ul } from '@utils/text';
import { reviewLockManager } from '@utils/reviewLockManager';
import log from '@utils/log';

export function findConfirmedSlots(interview: PairingSession): PairingSlot[] {
  return interview.slots.filter(slot =>
    isSlotConfirmed(slot, interview.format, interview.teammatesNeededCount),
  );
}

function isSlotConfirmed(
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

export const pairingSessionCloser = {
  async closeIfComplete(app: App, threadId: string): Promise<void> {
    const interview = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);

    if (!interview) {
      log.d('pairingSessionCloser', `Interview ${threadId} not found — likely already closed`);
      return;
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
      const slotLines = confirmedSlots.map(s => `${s.date}, ${s.startTime}–${s.endTime}`);
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} Pairing session for *${interview.candidateName}* is ready to schedule!\n\n` +
          `*Teammates:* ${teammates.map(t => mention({ id: t.userId })).join(', ')}\n\n` +
          `*Available slots (${confirmedSlots.length}):*\n${ul(...slotLines)}`,
      );
      await Promise.all(teammates.map(t => userRepo.markNowAsLastReviewedDate(t.userId)));
      await pairingSessionsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
      return;
    }

    const isUnfulfilled = interview.pendingTeammates.length === 0;

    if (isUnfulfilled) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} No teammates available to cover all slots for ${interview.candidateName}'s pairing session.`,
      );
      await pairingSessionsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
    }
  },
};
