import { ActiveReview, PartialPendingReviewer } from '@/database/models/ActiveReview';
import { userRepo } from '@/database/repos/userRepo';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import log from '@utils/log';
import Time from '@/utils/time';
import { User } from '@models/User';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { containsAny } from '@utils/array';

export async function getInitialUsersForReview(
  languages: string[],
  numberOfReviewers: number,
): Promise<User[]> {
  const allUsers = await userRepo.listAll();
  const usersWithPendingReview = await getAllUserIdsWithPendingReview();
  const excludedUserIds = new Set(usersWithPendingReview);
  return sortAndFilterUsers(allUsers, languages, excludedUserIds).slice(0, numberOfReviewers);
}

export function sortAndFilterUsers(
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
  if (l.lastReviewedDate == null && r.lastReviewedDate == null) {
    return 0.5 - Math.random();
  } else if (l.lastReviewedDate == null) {
    return -1;
  } else if (r.lastReviewedDate == null) {
    return 1;
  } else {
    return l.lastReviewedDate - r.lastReviewedDate;
  }
}

async function getAllUserIdsWithPendingReview(): Promise<string[]> {
  const otherActiveReviews = await activeReviewRepo.listAll();
  return otherActiveReviews.flatMap(review =>
    review.pendingReviewers.map(pendingReviewer => pendingReviewer.userId),
  );
}

export async function nextInLine(
  activeReview: ActiveReview,
): Promise<PartialPendingReviewer | undefined> {
  const users = await userRepo.listAll();
  const usersWithPendingReview = await getAllUserIdsWithPendingReview();
  const idsToExclude = new Set<string>([
    ...activeReview.pendingReviewers.map(({ userId }) => userId),
    ...activeReview.acceptedReviewers.map(({ userId }) => userId),
    ...activeReview.declinedReviewers.map(({ userId }) => userId),
    ...usersWithPendingReview,
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
