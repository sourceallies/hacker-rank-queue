import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { findConfirmedSlots, pairingSessionCloser } from '@/services/PairingSessionCloser';
import { pairingSessions } from '@/services/ThreadRecords';
import { determineCloseTime, requestCloseBusinessDays } from '@utils/reviewExpirationUtils';
import { PairingSession } from '@models/PairingSession';
import { App } from '@slack/bolt';
import log from '@utils/log';

/**
 * Closes any pairing session without a confirmed slot `REQUEST_CLOSE_BUSINESS_DAYS` business days
 * after it was requested. Not tied to slot times: recruiters schedule far enough ahead.
 */
export async function closeTimedOutPairingSessions(app: App): Promise<void> {
  const businessDays = requestCloseBusinessDays();
  const isTimedOut = (session: PairingSession) =>
    findConfirmedSlots(session).length === 0 &&
    Date.now() >= determineCloseTime(session.requestedAt, businessDays);

  const sessions = await pairingSessionsRepo.listAll();
  for (const session of sessions.filter(isTimedOut)) {
    try {
      // The session may have confirmed or closed since listAll(), so re-check the fresh copy
      await pairingSessions.withRecord(session.threadId, async freshSession => {
        if (!isTimedOut(freshSession)) return;
        log.d('closeTimedOutPairingSessions', `Closing unfilled session ${session.threadId}`);
        await pairingSessionCloser.closeUnfilledAfterTimeout(app, freshSession, businessDays);
      });
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when closing a timed-out pairing session', {
        session,
      })(err as Error);
    }
  }
}
