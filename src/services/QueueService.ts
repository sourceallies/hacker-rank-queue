import { ActiveReview, PendingReviewer } from '@/database/models/ActiveReview';
import { User } from '@/database/models/User';
import { userRepo } from '@/database/repos/userRepo';
import Time from '@/utils/time';

const REQUEST_EXPIRATION_MIN = Number(process.env.REQUEST_EXPIRATION_MIN) * Time.MINUTE;

export function sortUsers(l: User, r: User): number {
  if (l.lastReviewedAt == null) return -1;
  if (r.lastReviewedAt == null) return 1;
  return l.lastReviewedAt - r.lastReviewedAt;
}

export async function nextInLine(activeReview: ActiveReview): Promise<PendingReviewer> {
  const users = await userRepo.listAll();
  const idsToExclude = new Set<string>([
    ...activeReview.pendingReviewers.map(({ userId }) => userId),
    ...activeReview.acceptedReviewers,
    ...activeReview.declinedReviewers,
  ]);

  // TODO: Add language logic
  const possibleUsers = users.filter(({ id }) => !idsToExclude.has(id));
  if (possibleUsers.length === 0) {
    throw Error('No more reviewers');
  }
  possibleUsers.sort(sortUsers);

  return {
    userId: possibleUsers[0].id,
    expiresAt: Date.now() + REQUEST_EXPIRATION_MIN,
  };
}
