import { PairingInterview, PendingPairingTeammate } from '@models/PairingInterview';
import { InterviewFormat } from '@bot/enums';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { nextInLineForPairing } from '@/services/PairingQueueService';
import { pairingInterviewCloser } from '@/services/PairingInterviewCloser';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { App } from '@slack/bolt';
import log from '@utils/log';

export const pairingRequestService = {
  /**
   * Record which slots a teammate selected and remove them from pending.
   * Does NOT check close conditions — call pairingInterviewCloser.closeIfComplete after.
   */
  async recordSlotSelections(
    interview: PairingInterview,
    userId: string,
    selectedSlotIds: string[],
    userFormats: InterviewFormat[],
  ): Promise<PairingInterview> {
    const updated: PairingInterview = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      slots: interview.slots.map(slot => {
        if (!selectedSlotIds.includes(slot.id)) return slot;
        return {
          ...slot,
          interestedTeammates: [
            ...slot.interestedTeammates,
            { userId, acceptedAt: Date.now(), formats: userFormats },
          ],
        };
      }),
    };
    await pairingInterviewsRepo.update(updated);
    return updated;
  },

  /**
   * Move a teammate from pending to declined, update their DM, and request the next person.
   */
  async declineTeammate(
    app: App,
    interview: PairingInterview,
    userId: string,
    closeMessage: string,
  ): Promise<PairingInterview> {
    const pending = interview.pendingTeammates.find(t => t.userId === userId);
    if (!pending) {
      throw new Error(
        `${userId} tried to decline ${interview.threadId} but was not in pending list`,
      );
    }

    const updated: PairingInterview = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      declinedTeammates: [...interview.declinedTeammates, { userId, declinedAt: Date.now() }],
    };
    await pairingInterviewsRepo.update(updated);

    await chatService.updateDirectMessage(app.client, userId, pending.messageTimestamp, [
      { type: 'section', text: { type: 'mrkdwn', text: closeMessage } },
    ]);

    await this.requestNextTeammate(app, updated);
    return updated;
  },

  async requestNextTeammate(app: App, interview: PairingInterview): Promise<void> {
    const next = await nextInLineForPairing(interview);
    if (!next) {
      log.d('pairingRequestService', `No next teammate for ${interview.threadId}`);
      await pairingInterviewCloser.closeIfComplete(app, interview.threadId);
      return;
    }

    const messageTimestamp = await this.sendTeammateDM(app, next.userId, interview);
    const pendingEntry: PendingPairingTeammate = {
      userId: next.userId,
      expiresAt: determineExpirationTime(new Date()),
      messageTimestamp,
    };
    const refreshed = await pairingInterviewsRepo.getByThreadIdOrFail(interview.threadId);
    refreshed.pendingTeammates.push(pendingEntry);
    await pairingInterviewsRepo.update(refreshed);
  },

  async sendTeammateDM(app: App, userId: string, interview: PairingInterview): Promise<string> {
    const dmId = await chatService.getDirectMessageId(app.client, userId);
    const payload = pairingRequestBuilder.buildTeammateDM(
      dmId,
      { id: interview.requestorId },
      interview.candidateName,
      interview.languages,
      interview.format,
      interview.candidateType,
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
