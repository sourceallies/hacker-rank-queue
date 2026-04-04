import { User } from '@models/User';
import { PairingSession, PendingPairingTeammate } from '@models/PairingSession';
import { InterviewFormat, InterviewType } from '@bot/enums';
import { userRepo } from '@repos/userRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { containsAny } from '@utils/array';
import { byLastReviewedDate } from './QueueService';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import log from '@utils/log';

export function filterUsersForPairing(
  users: User[],
  languages: string[],
  format: InterviewFormat,
): User[] {
  return users
    .filter(u => u.interviewTypes.includes(InterviewType.PAIRING))
    .filter(u => containsAny(u.languages, languages))
    .filter(u => {
      if (format === InterviewFormat.IN_PERSON) {
        return u.formats.includes(InterviewFormat.IN_PERSON);
      }
      // Remote and Hybrid: anyone is eligible (hybrid close logic enforces the in-person constraint)
      return true;
    });
}

export async function getInitialUsersForPairingSession(
  languages: string[],
  format: InterviewFormat,
  count: number,
): Promise<User[]> {
  const allUsers = await userRepo.listAll();
  const usersWithPendingInterview = await getAllUserIdsWithPendingPairingSession();
  const excludedIds = new Set(usersWithPendingInterview);

  const eligible = filterUsersForPairing(allUsers, languages, format)
    .filter(u => !excludedIds.has(u.id))
    .sort(byLastReviewedDate);

  return eligible.slice(0, count);
}

export async function nextInLineForPairing(
  interview: PairingSession,
): Promise<PendingPairingTeammate | undefined> {
  const allUsers = await userRepo.listAll();
  const usersWithPendingInterview = await getAllUserIdsWithPendingPairingSession();

  const alreadyInvolvedIds = new Set<string>([
    ...interview.pendingTeammates.map(t => t.userId),
    ...interview.declinedTeammates.map(t => t.userId),
    ...interview.slots.flatMap(s => s.interestedTeammates.map(t => t.userId)),
    ...usersWithPendingInterview,
  ]);

  const [nextUser] = filterUsersForPairing(allUsers, interview.languages, interview.format)
    .filter(u => !alreadyInvolvedIds.has(u.id))
    .sort(byLastReviewedDate);

  if (!nextUser) {
    log.d('PairingQueueService.nextInLineForPairing', 'No next user found');
    return undefined;
  }

  return {
    userId: nextUser.id,
    expiresAt: determineExpirationTime(new Date()),
    messageTimestamp: '',
  };
}

async function getAllUserIdsWithPendingPairingSession(): Promise<string[]> {
  const interviews = await pairingSessionsRepo.listAll();
  return interviews.flatMap(i => i.pendingTeammates.map(t => t.userId));
}
