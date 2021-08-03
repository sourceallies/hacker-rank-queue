import { User } from '@/database/models/User';
import { sortUsers } from '../QueueService';
import Time from '@utils/time';

function makeUser(timeSinceLastReview: number | null): User {
  return {
    id: Symbol('user-id') as any,
    languages: [],
    lastReviewedAt: timeSinceLastReview == null ? undefined : Date.now() - timeSinceLastReview,
  };
}

describe('Queue Service', () => {
  describe('sortUsers', () => {
    it('should return users without a lastReviewedAt date first', () => {
      const newUser: User = makeUser(null);
      const existingUser: User = makeUser(2 * Time.DAY);

      const inputUsers: User[] = [existingUser, newUser];
      const expectedUsers: User[] = [newUser, existingUser];
      const actualUsers = inputUsers.sort(sortUsers);

      expect(actualUsers).toEqual(expectedUsers);
    });

    it('should return users with a older lastReviewedAt date second', () => {
      const user1: User = makeUser(1 * Time.DAY);
      const user2: User = makeUser(2 * Time.DAY);
      const user3: User = makeUser(3 * Time.DAY);

      const inputUsers: User[] = [user1, user2, user3];
      const expectedUsers: User[] = [user3, user2, user1];
      const actualUsers = inputUsers.sort(sortUsers);

      expect(actualUsers).toEqual(expectedUsers);
    });
  });
});
