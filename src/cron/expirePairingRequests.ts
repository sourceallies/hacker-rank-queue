import { PairingSession } from '@/database/models/PairingSession';
import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { pairingRequestService } from '@/services/PairingRequestService';
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
      const freshInterview = await pairingSessionsRepo.getByThreadIdOrUndefined(interview.threadId);
      if (!freshInterview) continue;

      if (!freshInterview.pendingTeammates.some(t => t.userId === teammateId)) continue;

      log.d(
        'expirePairingRequests',
        `Expiring pairing session ${interview.threadId} for teammate ${teammateId}`,
      );

      await pairingRequestService.declineTeammate(app, freshInterview, teammateId, expireMessage);
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
