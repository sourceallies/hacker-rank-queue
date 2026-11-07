import { PairingSession } from '@/database/models/PairingSession';
import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingSessions } from '@/services/ThreadRecords';
import { App } from '@slack/bolt';
import log from '@utils/log';

interface ExpiredPairingRequest {
  interview: PairingSession;
  teammateId: string;
}

const expireMessage = 'The request has expired. You will keep your spot in the queue.';

export async function expirePairingRequests(app: App): Promise<void> {
  const interviews = await pairingSessionsRepo.listAll();
  const expiredRequests = interviews.flatMap((interview): ExpiredPairingRequest[] =>
    interview.pendingTeammates
      .filter(({ expiresAt }) => Date.now() > expiresAt)
      .map(({ userId }) => ({ interview, teammateId: userId })),
  );

  for (const { interview, teammateId } of expiredRequests) {
    try {
      // Same per-thread lock as submitTimes, so picks that land mid-expire aren't overwritten.
      // The session may have changed since listAll(), so re-check against the fresh copy.
      await pairingSessions.withRecord(interview.threadId, async freshInterview => {
        const stillExpired = freshInterview.pendingTeammates.some(
          ({ userId, expiresAt }) => userId === teammateId && Date.now() > expiresAt,
        );
        if (!stillExpired) return;

        log.d(
          'expirePairingRequests',
          `Expiring pairing session ${interview.threadId} for teammate ${teammateId}`,
        );

        await pairingRequestService.declineTeammate(app, freshInterview, teammateId, expireMessage);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(
        app,
        'Unknown error when trying to expire a pairing session request',
        { interview, teammateId },
      )(err);
    }
  }
}
