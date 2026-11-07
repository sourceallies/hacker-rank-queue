import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { userRepo } from '@repos/userRepo';
import { chatService } from '@/services/ChatService';
import { confirmedSlots, isUnfulfilled } from '@/services/pairingSessionRules';
import { App } from '@slack/bolt';
import { WebClient } from '@/slackTypes';
import { formatSlot, mention, ul } from '@utils/text';
import log from '@utils/log';

async function finalize(client: WebClient, threadId: string, message: string): Promise<void> {
  await chatService.replyToReviewThread(client, threadId, message);
  await pairingSessionsRepo.remove(threadId);
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

    const confirmed = confirmedSlots(interview);

    if (confirmed.length > 0) {
      const teammates = Array.from(
        new Map(
          confirmed
            .flatMap(s => s.interestedTeammates)
            .map(t => [t.userId, t] as [string, typeof t]),
        ).values(),
      );
      const slotLines = confirmed.map(s => formatSlot(s.date, s.startTime, s.endTime));
      const message =
        `${mention({ id: interview.requestorId })} Pairing session for *${interview.candidateName}* is ready to schedule!\n\n` +
        `*Teammates:* ${teammates.map(t => mention({ id: t.userId })).join(', ')}\n\n` +
        `*Available slots (${confirmed.length}):*\n${ul(...slotLines)}`;
      await Promise.all(teammates.map(t => userRepo.markNowAsLastPairingReviewedDate(t.userId)));
      await finalize(app.client, threadId, message);
      return true;
    }

    if (isUnfulfilled(interview)) {
      const slotsWithInterest = interview.slots.filter(s => s.interestedTeammates.length > 0);
      const header = `${mention({ id: interview.requestorId })} Couldn't fill all slots for *${interview.candidateName}*'s pairing session.`;

      const message =
        slotsWithInterest.length > 0
          ? `${header}\n\n` +
            `Some teammates did sign up — you may be able to reach out to them directly:\n` +
            ul(
              ...slotsWithInterest.map(
                s =>
                  `${formatSlot(s.date, s.startTime, s.endTime)} — ${s.interestedTeammates
                    .map(t => mention({ id: t.userId }))
                    .join(', ')}`,
              ),
            )
          : `${header} No teammates signed up.`;

      await finalize(app.client, threadId, message);
      return true;
    }

    return false;
  },
};
