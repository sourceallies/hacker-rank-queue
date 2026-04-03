import { PairingInterview, PairingSlot } from '@models/PairingInterview';
import { InterviewFormat } from '@bot/enums';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@/services/ChatService';
import { App } from '@slack/bolt';
import { mention } from '@utils/text';
import { reviewLockManager } from '@utils/reviewLockManager';
import log from '@utils/log';

export function findConfirmedSlot(interview: PairingInterview): PairingSlot | undefined {
  return interview.slots.find(slot => isSlotConfirmed(slot, interview.format));
}

function isSlotConfirmed(slot: PairingSlot, format: InterviewFormat): boolean {
  if (slot.interestedTeammates.length < 2) return false;

  if (format === InterviewFormat.HYBRID) {
    return slot.interestedTeammates.some(t => t.formats.includes(InterviewFormat.IN_PERSON));
  }

  return true;
}

export const pairingInterviewCloser = {
  async closeIfComplete(app: App, threadId: string): Promise<void> {
    const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);

    if (!interview) {
      log.d('pairingInterviewCloser', `Interview ${threadId} not found — likely already closed`);
      return;
    }

    const confirmedSlot = findConfirmedSlot(interview);

    if (confirmedSlot) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} Pairing interview for ${interview.candidateName} is confirmed! ` +
          `Slot: ${confirmedSlot.date}, ${confirmedSlot.startTime}–${confirmedSlot.endTime}. ` +
          `Teammates: ${confirmedSlot.interestedTeammates.map(t => mention({ id: t.userId })).join(' and ')}.`,
      );
      await pairingInterviewsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
      return;
    }

    const hasAnyInterest = interview.slots.some(slot => slot.interestedTeammates.length > 0);
    const isUnfulfilled =
      interview.pendingTeammates.length === 0 && !hasAnyInterest && !findConfirmedSlot(interview);

    if (isUnfulfilled) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} No teammates available to cover all slots for ${interview.candidateName}'s pairing interview.`,
      );
      await pairingInterviewsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
    }
  },
};
