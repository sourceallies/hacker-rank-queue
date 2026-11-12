import { PairingSession, PairingSlot, PendingPairingTeammate } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { nextInLineForPairing } from '@/services/PairingQueueService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { App } from '@slack/bolt';
import { pairingSessions } from '@/services/ThreadRecords';
import { reportErrorAndContinue } from '@utils/reportError';
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

function isOnSession(session: PairingSession, userId: string): boolean {
  return (
    session.pendingTeammates.some(t => t.userId === userId) ||
    session.slots.some(slot => slot.interestedTeammates.some(t => t.userId === userId))
  );
}

export const pairingRequestService = {
  /**
   * Which of the slots a teammate picked would actually take them.
   *
   * A slot that already has enough teammates silently rejects further ones. If that's true of every
   * slot they picked, recording would drop them from pendingTeammates without adding them anywhere
   * else — and nextInLineForPairing, which excludes only pending/declined/interested users, would
   * hand them the very same session again, forever. Callers must decline instead.
   */
  slotsWithRoomFor(
    interview: PairingSession,
    selectedSlotIds: string[],
    userFormats: InterviewFormat[],
  ): PairingSlot[] {
    return interview.slots
      .filter(slot => selectedSlotIds.includes(slot.id))
      .filter(slot =>
        slotNeedsTeammate(slot, interview.format, interview.teammatesNeededCount, userFormats),
      );
  },

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
    if (!next) {
      log.d('pairingRequestService', `No next teammate for ${interview.threadId}`);
      await pairingSessionCloser.closeIfComplete(app, interview.threadId);
      return;
    }

    await this.offerTo(app, interview, next.userId);
  },

  /**
   * Offers the session to up to `size` more teammates, next in line first. Offers stay open until
   * the session closes. Returns how many were sent; fewer than `size` means the queue ran out.
   * Callers must hold the session's lock, and should run the close check afterwards.
   */
  async sendWave(app: App, threadId: string, size: number): Promise<number> {
    let sent = 0;
    while (sent < size) {
      const session = await pairingSessionsRepo.getByThreadIdOrUndefined(threadId);
      const next = session && (await nextInLineForPairing(session));
      if (!session || !next) break;
      await this.offerTo(app, session, next.userId);
      sent++;
    }
    return sent;
  },

  async offerTo(app: App, interview: PairingSession, userId: string): Promise<void> {
    const messageTimestamp = await this.sendTeammateDM(app, userId, interview);
    const pendingEntry: PendingPairingTeammate = {
      userId,
      offeredAt: Date.now(),
      messageTimestamp,
    };
    const refreshed = await pairingSessionsRepo.getByThreadIdOrFail(interview.threadId);
    await pairingSessionsRepo.update({
      ...refreshed,
      pendingTeammates: [...refreshed.pendingTeammates, pendingEntry],
    });
  },

  /**
   * After `userIds` are booked on a confirmed slot of `confirmedThreadId`, take them off every other
   * open pairing session: unanswered offers and slots they already picked. Each counts as a
   * decline there, and the next person in line is asked in their place.
   *
   * Call this after the confirmed session's lock is released. Sessions are locked one at a time:
   * nesting a second session's lock inside the first can deadlock.
   */
  async withdrawFromOtherSessions(
    app: App,
    userIds: string[],
    confirmedThreadId: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const sessions = await pairingSessionsRepo.listAll();
    for (const listed of sessions) {
      if (listed.threadId === confirmedThreadId) continue;
      if (!userIds.some(userId => isOnSession(listed, userId))) continue;
      try {
        await pairingSessions.withRecord(listed.threadId, async fresh => {
          let session: PairingSession | undefined = fresh;
          for (const userId of userIds) {
            if (!session) return; // closed by the previous withdrawal
            if (!isOnSession(session, userId)) continue;
            log.d(
              'pairingRequestService.withdrawFromOtherSessions',
              `Withdrawing ${userId} from ${session.threadId}; booked on ${confirmedThreadId}`,
            );
            await this.withdrawTeammate(app, session, userId);
            session = await pairingSessionsRepo.getByThreadIdOrUndefined(listed.threadId);
          }
        });
      } catch (err) {
        await reportErrorAndContinue(app, 'Unknown error when withdrawing a pairing teammate', {
          userIds,
          confirmedThreadId,
          threadId: listed.threadId,
        })(err as Error);
      }
    }
  },

  async withdrawTeammate(app: App, session: PairingSession, userId: string): Promise<void> {
    const message = `You're booked on another pairing session, so we've taken you off *${session.candidateName}*'s session.`;
    if (session.pendingTeammates.some(t => t.userId === userId)) {
      await this.declineTeammate(app, session, userId, message);
      return;
    }
    // They already picked slots here, so their offer DM is gone; tell them in a new message
    const updated: PairingSession = {
      ...session,
      slots: session.slots.map(slot => ({
        ...slot,
        interestedTeammates: slot.interestedTeammates.filter(t => t.userId !== userId),
      })),
      declinedTeammates: [...session.declinedTeammates, { userId, declinedAt: Date.now() }],
    };
    await pairingSessionsRepo.update(updated);
    await chatService.sendDirectMessage(app.client, userId, message);
    await this.requestNextTeammate(app, updated);
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
