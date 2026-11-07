import { PairingSession, PendingPairingTeammate } from '@models/PairingSession';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { nextInLineForPairing } from '@/services/PairingQueueService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { decline } from '@/services/pairingSessionRules';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { App } from '@slack/bolt';
import log from '@utils/log';

export const pairingRequestService = {
  /**
   * Move a teammate from pending to declined, update their DM, and request the next person.
   */
  async declineTeammate(
    app: App,
    interview: PairingSession,
    userId: string,
    closeMessage: string,
  ): Promise<PairingSession> {
    const { session: updated, declined } = decline(interview, userId, Date.now());
    await pairingSessionsRepo.update(updated);

    await chatService.updateDirectMessage(app.client, userId, declined.messageTimestamp, [
      { type: 'section', text: { type: 'mrkdwn', text: closeMessage } },
    ]);

    await this.requestNextTeammate(app, updated);
    return updated;
  },

  async requestNextTeammate(app: App, interview: PairingSession): Promise<void> {
    const next = await nextInLineForPairing(interview);
    if (!next) {
      log.d('pairingRequestService', `No next teammate for ${interview.threadId}`);
      await pairingSessionCloser.closeIfComplete(app, interview.threadId);
      return;
    }

    const messageTimestamp = await this.sendTeammateDM(app, next.userId, interview);
    const pendingEntry: PendingPairingTeammate = {
      userId: next.userId,
      expiresAt: determineExpirationTime(new Date()),
      messageTimestamp,
    };
    const refreshed = await pairingSessionsRepo.getByThreadIdOrFail(interview.threadId);
    await pairingSessionsRepo.update({
      ...refreshed,
      pendingTeammates: [...refreshed.pendingTeammates, pendingEntry],
    });
  },

  async sendTeammateDM(app: App, userId: string, interview: PairingSession): Promise<string> {
    const dmId = await chatService.getDirectMessageId(app.client, userId);
    const payload = pairingRequestBuilder.buildTeammateDM(dmId, interview);
    const message = await app.client.chat.postMessage({
      ...payload,
      token: process.env.SLACK_BOT_TOKEN,
    });
    if (!message.ts) throw new Error('No timestamp on pairing DM response');
    return message.ts;
  },
};
