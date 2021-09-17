import { User } from '@/database/models/User';
import { userRepo } from '@/database/repos/userRepo';
import Time from '@utils/time';
import { getInitialUsersForReview, sortUsersCallback } from '../QueueService';

function makeUser(timeSinceLastReview: number | null): User {
  return {
    id: Symbol('user-id') as any,
    name: Symbol('name') as any,
    languages: [],
    lastReviewedDate: timeSinceLastReview == null ? undefined : Date.now() - timeSinceLastReview,
  };
}

describe('Queue Service', () => {
  describe('sortUsersCallback', () => {
    it('should return users without a lastReviewedAt date first', () => {
      const newUser: User = makeUser(null);
      const existingUser: User = makeUser(2 * Time.DAY);

      const inputUsers: User[] = [existingUser, newUser];
      const expectedUsers: User[] = [newUser, existingUser];
      const actualUsers = inputUsers.sort(sortUsersCallback);

      expect(actualUsers).toEqual(expectedUsers);
    });

    it('should return users with a older lastReviewedAt date second', () => {
      const user1: User = makeUser(1 * Time.DAY);
      const user2: User = makeUser(2 * Time.DAY);
      const user3: User = makeUser(3 * Time.DAY);

      const inputUsers: User[] = [user1, user2, user3];
      const expectedUsers: User[] = [user3, user2, user1];
      const actualUsers = inputUsers.sort(sortUsersCallback);

      expect(actualUsers).toEqual(expectedUsers);
    });
  });

  describe('getInitialUsersForReview', () => {
    let matchingUser1: User;
    let matchingUser2: User;
    let matchingUser3: User;
    let nonMatchingUser1: User;

    beforeEach(() => {
      matchingUser1 = {
        id: 'expectedUser1',
        name: 'Expected User 1',
        languages: ['Java', 'C#', 'Something obscure'],
        lastReviewedDate: 1,
      };
      matchingUser2 = {
        id: 'expectedUser2',
        name: 'Expected User 2',
        languages: ['Java', 'C#', 'Something random'],
        lastReviewedDate: 2,
      };
      matchingUser3 = {
        id: 'trimmedUser',
        name: 'Trimmed User',
        languages: ['Java', 'C#', 'Something embarrassing'],
        lastReviewedDate: 3,
      };
      nonMatchingUser1 = {
        id: 'missing needed language',
        name: 'Unknown',
        languages: ['Java', 'language they wrote themselves'],
        lastReviewedDate: 1,
      };
    });

    it('should filter users by language and trim to number of reviewers', async () => {
      const users: User[] = [nonMatchingUser1, matchingUser1, matchingUser3, matchingUser2];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java', 'C#'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 2);

      expect(actualUsers).toEqual([matchingUser1, matchingUser2]);
    });

    it('should return all users that match even when that is less than requested', async () => {
      const users: User[] = [nonMatchingUser1, matchingUser1, matchingUser3, matchingUser2];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java', 'C#'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 5);

      expect(actualUsers).toEqual([matchingUser1, matchingUser2, matchingUser3]);
    });
  });
});
