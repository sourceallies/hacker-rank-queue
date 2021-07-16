import { User } from '@models/User';

export function sortUsersByLastReviewed(users: User[]): User[] {
  return [...users].sort((userA, userB) => {
    if (userA.lastReviewedDate == null && userB.lastReviewedDate == null) {
      return 0;
    }
    if (userA.lastReviewedDate == null) {
      return 1;
    }
    if (userB.lastReviewedDate == null) {
      return -1;
    }
    return userA.lastReviewedDate - userB.lastReviewedDate;
  });
}
