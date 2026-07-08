import { pairingSessionsRepo } from '@/database/repos/pairingSessionsRepo';
import { reportErrorAndContinue } from '@/utils/reportError';
import { pairingRequestService } from '@/services/PairingRequestService';
import { App } from '@slack/bolt';
import log from '@utils/log';

export async function expirePairingRequests(app: App): Promise<void> {
  const interviews = await pairingSessionsRepo.listAll();
  const interviewsToExpand = interviews.filter(interview => Date.now() > interview.nextExpandAt);

  for (const interview of interviewsToExpand) {
    try {
      log.d('expirePairingRequests', `Expanding pairing session ${interview.threadId}`);
      await pairingRequestService.expandTeammates(app, interview);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await reportErrorAndContinue(
        app,
        'Unknown error when trying to expand pairing session with additional teammate',
        { interview },
      )(err);
    }
  }
}
