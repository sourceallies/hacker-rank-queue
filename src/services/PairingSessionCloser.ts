import { PairingSession, PairingSlot } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { App } from '@slack/bolt';
import { mention } from '@utils/text';
import { reviewLockManager } from '@utils/reviewLockManager';
import log from '@utils/log';

export function findConfirmedSlot(interview: PairingSession): PairingSlot | undefined {
  return interview.slots.find(slot => isSlotConfirmed(slot, interview.format));
}

function isSlotConfirmed(slot: PairingSlot, format: InterviewFormat): boolean {
  if (slot.interestedTeammates.length < 2) return false;

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

    const confirmedSlot = findConfirmedSlot(interview);

    if (confirmedSlot) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} Pairing session for ${interview.candidateName} is confirmed! ` +
          `Slot: ${confirmedSlot.date}, ${confirmedSlot.startTime}–${confirmedSlot.endTime}. ` +
          `Teammates: ${confirmedSlot.interestedTeammates.map(t => mention({ id: t.userId })).join(' and ')}.`,
      );
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
