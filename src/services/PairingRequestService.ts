import { PairingSession, PairingSlot, PendingPairingTeammate } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { nextInLineForPairing } from '@/services/PairingQueueService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { App } from '@slack/bolt';
import log from '@utils/log';

function slotNeedsTeammate(
  slot: PairingSlot,
  format: InterviewFormat,
  teammatesNeededCount: number,
  userFormats: InterviewFormat[],
): boolean {
  const count = slot.interestedTeammates.length;
  if (count >= teammatesNeededCount) return false;

  if (format === InterviewFormat.HYBRID) {
    const hasInPerson = slot.interestedTeammates.some(t =>
      t.formats.includes(InterviewFormat.IN_PERSON),
    );
    if (!hasInPerson && count === teammatesNeededCount - 1) {
      // One spot left and no in-person yet — reserve it
      return userFormats.includes(InterviewFormat.IN_PERSON);
    }
  }

  return true;
}

export const pairingRequestService = {
  /**
   * Record which slots a teammate selected and remove them from pending.
   * Does NOT check close conditions — call pairingSessionCloser.closeIfComplete after.
   */
  async recordSlotSelections(
    interview: PairingSession,
    userId: string,
    selectedSlotIds: string[],
    userFormats: InterviewFormat[],
  ): Promise<PairingSession> {
    const updated: PairingSession = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      slots: interview.slots.map(slot => {
        if (!selectedSlotIds.includes(slot.id)) return slot;
        if (!slotNeedsTeammate(slot, interview.format, interview.teammatesNeededCount, userFormats))
          return slot;
        return {
          ...slot,
          interestedTeammates: [
            ...slot.interestedTeammates,
            { userId, acceptedAt: Date.now(), formats: userFormats },
          ],
        };
      }),
    };
    await pairingSessionsRepo.update(updated);
    return updated;
  },

  /**
   * Move a teammate from pending to declined, update their DM, and request the next person.
   */
  async declineTeammate(
    app: App,
    interview: PairingSession,
    userId: string,
    closeMessage: string,
  ): Promise<PairingSession> {
    const pending = interview.pendingTeammates.find(t => t.userId === userId);
    if (!pending) {
      throw new Error(
        `${userId} tried to decline ${interview.threadId} but was not in pending list`,
      );
    }

    const updated: PairingSession = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      declinedTeammates: [...interview.declinedTeammates, { userId, declinedAt: Date.now() }],
    };
    await pairingSessionsRepo.update(updated);

    await chatService.updateDirectMessage(app.client, userId, pending.messageTimestamp, [
      { type: 'section', text: { type: 'mrkdwn', text: closeMessage } },
    ]);

    await this.requestNextTeammate(app, updated);
    return updated;
  },

  async requestNextTeammate(app: App, interview: PairingSession): Promise<void> {
    const next = await nextInLineForPairing(interview);
    const nextExpandAt = determineExpirationTime(new Date());
    if (!next) {
      log.d('pairingRequestService', `No next teammate for ${interview.threadId}`);
      const refreshed = await pairingSessionsRepo.getByThreadIdOrFail(interview.threadId);
      await pairingSessionsRepo.update({ ...refreshed, nextExpandAt });
      await pairingSessionCloser.closeIfComplete(app, interview.threadId);
      return;
    }

    const messageTimestamp = await this.sendTeammateDM(app, next.userId, interview);
    const pendingEntry: PendingPairingTeammate = { userId: next.userId, messageTimestamp };
    const refreshed = await pairingSessionsRepo.getByThreadIdOrFail(interview.threadId);
    await pairingSessionsRepo.update({
      ...refreshed,
      nextExpandAt,
      pendingTeammates: [...refreshed.pendingTeammates, pendingEntry],
    });
  },

  /**
   * Adds the next batch of teammates from the queue without closing any existing DMs.
   */
  async expandTeammates(app: App, interview: PairingSession): Promise<void> {
    const batchSize = Number(process.env.NUMBER_OF_INITIAL_REVIEWERS);
    for (let i = 0; i < batchSize; i++) {
      const fresh = await pairingSessionsRepo.getByThreadIdOrFail(interview.threadId);
      await this.requestNextTeammate(app, fresh);
    }
  },

  async sendTeammateDM(app: App, userId: string, interview: PairingSession): Promise<string> {
    const dmId = await chatService.getDirectMessageId(app.client, userId);
    const payload = pairingRequestBuilder.buildTeammateDM(
      dmId,
      { id: interview.requestorId },
      interview.candidateName,
      interview.languages,
      interview.format,
      interview.slots,
      interview.threadId,
    );
    const message = await app.client.chat.postMessage({
      ...payload,
      token: process.env.SLACK_BOT_TOKEN,
    });
    if (!message.ts) throw new Error('No timestamp on pairing DM response');
    return message.ts;
  },
};
