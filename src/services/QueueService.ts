import { ActiveReview, PendingReviewer } from '@/database/models/ActiveReview';
import { User } from '@models/User';
import { userRepo } from '@/database/repos/userRepo';
import Time from '@/utils/time';
import { containsAll } from '@/utils/array';

const REQUEST_EXPIRATION_MIN = Number(process.env.REQUEST_EXPIRATION_MIN) * Time.MINUTE;

export async function getInitialUsersForReview(
  languages: string[],
  numberOfReviewers: number,
): Promise<User[]> {
  const allUsers = await userRepo.listAll();
  return sortAndFilterUsers(allUsers, languages).slice(0, numberOfReviewers);
}

function sortAndFilterUsers(
  users: User[],
  languages: string[],
  excludedUserIds: Set<string> = new Set(),
): User[] {
  const allowedUsers = users.filter(({ id }) => !excludedUserIds.has(id));
  const usersByLanguage = allowedUsers.filter(user => containsAll(user.languages, languages));

  return usersByLanguage.sort(sortUsersCallback);
}

export function sortUsersCallback(l: User, r: User): number {
  if (l.lastReviewedDate == null) return -1;
  if (r.lastReviewedDate == null) return 1;
  return l.lastReviewedDate - r.lastReviewedDate;
}

export async function nextInLine(activeReview: ActiveReview): Promise<PendingReviewer | undefined> {
  const users = await userRepo.listAll();
  const idsToExclude = new Set<string>([
    ...activeReview.pendingReviewers.map(({ userId }) => userId),
    ...activeReview.acceptedReviewers,
    ...activeReview.declinedReviewers,
  ]);

  const [nextUser] = sortAndFilterUsers(users, activeReview.languages, idsToExclude);

  if (nextUser == null) return undefined;
  return {
    userId: nextUser.id,
    expiresAt: Date.now() + REQUEST_EXPIRATION_MIN,
  };
}
