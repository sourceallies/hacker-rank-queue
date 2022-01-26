import { ActiveReview, PartialPendingReviewer } from '@/database/models/ActiveReview';
import { userRepo } from '@/database/repos/userRepo';
import log from '@/utils/log';
import Time from '@/utils/time';
import { User } from '@models/User';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { containsAny } from '@utils/array';

export async function getInitialUsersForReview(
  languages: string[],
  numberOfReviewers: number,
): Promise<User[]> {
  const allUsers = await userRepo.listAll();
  let matches: User[] = [];
  let numberOfReviewersStillNeeded = numberOfReviewers;
  // loop through and call to retrieve users until our desired amount of reviewers is
  // found, or we can't find enough that match our criteria.
  while (numberOfReviewersStillNeeded > 0) {
    const matchesWithFewerLanguages = sortAndFilterUsers(
      allUsers,
      languages,
      new Set(matches.map(user => user.id)),
    ).slice(0, numberOfReviewersStillNeeded);
    matches = matches.concat(matchesWithFewerLanguages);
    numberOfReviewersStillNeeded = numberOfReviewers - matches.length;

    // break out of loop if we can't find any more users that match the criteria
    if (matchesWithFewerLanguages.length == 0) {
      break;
    }
  }
  return matches;
}

function sortAndFilterUsers(
  users: User[],
  languages: string[],
  excludedUserIds: Set<string> = new Set(),
): User[] {
  const allowedUsers = users.filter(({ id }) => !excludedUserIds.has(id));
  const usersWithAMatchingLanguage = allowedUsers.filter(user =>
    containsAny(user.languages, languages),
  );

  return usersWithAMatchingLanguage.sort(byLastReviewedDate);
}

export function byLastReviewedDate(l: User, r: User): number {
  if (l.lastReviewedDate == null) return -1;
  if (r.lastReviewedDate == null) return 1;
  return l.lastReviewedDate - r.lastReviewedDate;
}

export async function nextInLine(
  activeReview: ActiveReview,
): Promise<PartialPendingReviewer | undefined> {
  const users = await userRepo.listAll();
  const idsToExclude = new Set<string>([
    ...activeReview.pendingReviewers.map(({ userId }) => userId),
    ...activeReview.acceptedReviewers,
    ...activeReview.declinedReviewers,
  ]);

  const [nextUser] = sortAndFilterUsers(users, activeReview.languages, idsToExclude);

  if (nextUser == null) {
    log.d('nextInLine', 'Next user not found');
    return undefined;
  }
  const next = {
    userId: nextUser.id,
    expiresAt: determineExpirationTime(new Date()),
  };
  log.d(
    'nextInLine',
    'Next user:',
    JSON.stringify({
      next,
      now: Date.now(),
      env: Number(process.env.REQUEST_EXPIRATION_MIN) * Time.MINUTE,
      min: Time.MINUTE,
    }),
  );
  return next;
}
