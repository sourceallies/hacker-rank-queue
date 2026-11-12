import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessionCloser } from '@/services/PairingSessionCloser';
import { pairingSessions } from '@/services/ThreadRecords';
import { waveIntervalMs, waveSize } from '@utils/waveSettings';
import { PairingSession } from '@models/PairingSession';
import { App } from '@slack/bolt';
import log from '@utils/log';

/**
 * Offers each open pairing session to the next wave of teammates once its newest offer is at
 * least `WAVE_INTERVAL_MIN` old. Offers are never taken back; the session keeps growing until a
 * slot is confirmed, it runs out of people, or it times out (`closeTimedOutPairingSessions`).
 */
export async function sendPairingWaves(app: App): Promise<void> {
  const size = waveSize();
  const interval = waveIntervalMs();
  const isWaveDue = (session: PairingSession) => Date.now() - newestOfferAt(session) >= interval;

  const sessions = await pairingSessionsRepo.listAll();
  for (const session of sessions.filter(isWaveDue)) {
    try {
      // A pick, decline or another wave may have landed since listAll(), so re-check
      await pairingSessions.withRecord(session.threadId, async freshSession => {
        if (!isWaveDue(freshSession)) return;
        const sent = await pairingRequestService.sendWave(app, session.threadId, size);
        log.d('sendPairingWaves', `Sent a wave of ${sent} for session ${session.threadId}`);
        await pairingSessionCloser.closeIfComplete(app, session.threadId);
      });
    } catch (err) {
      await reportErrorAndContinue(app, 'Unknown error when sending a wave of pairing offers', {
        session,
      })(err as Error);
    }
  }
}

/** With nobody pending, nobody is being asked, so a wave is due straight away. */
function newestOfferAt(session: PairingSession): number {
  return Math.max(0, ...session.pendingTeammates.map(({ offeredAt }) => offeredAt));
}
