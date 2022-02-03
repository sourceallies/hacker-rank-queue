import { User } from '@/database/models/User';
import { userRepo } from '@/database/repos/userRepo';
import Time from '@utils/time';
import { getInitialUsersForReview, byLastReviewedDate } from '../QueueService';

function makeUser(timeSinceLastReview: number | null): User {
  return {
    id: Symbol('user-id') as any,
    name: Symbol('name') as any,
    languages: [],
    lastReviewedDate: timeSinceLastReview == null ? undefined : Date.now() - timeSinceLastReview,
  };
}

describe('Queue Service', () => {
  describe('byLastReviewedDate', () => {
    it('should return users without a lastReviewedAt date first', () => {
      const newUser: User = makeUser(null);
      const existingUser: User = makeUser(2 * Time.DAY);

      const inputUsers: User[] = [existingUser, newUser];
      const expectedUsers: User[] = [newUser, existingUser];
      const actualUsers = inputUsers.sort(byLastReviewedDate);

      expect(actualUsers).toEqual(expectedUsers);
    });

    it('should return users with a older lastReviewedAt date second', () => {
      const user1: User = makeUser(1 * Time.DAY);
      const user2: User = makeUser(2 * Time.DAY);
      const user3: User = makeUser(3 * Time.DAY);

      const inputUsers: User[] = [user1, user2, user3];
      const expectedUsers: User[] = [user3, user2, user1];
      const actualUsers = inputUsers.sort(byLastReviewedDate);

      expect(actualUsers).toEqual(expectedUsers);
    });

    it('should randomly pick users if multiple do not have a lastReviewedAt date', () => {
      const user1: User = makeUser(null);
      const user2: User = makeUser(null);
      const user3: User = makeUser(Time.DAY);

      const inputUsers: User[] = [user2, user1, user3];

      const actualUsers = inputUsers.sort(byLastReviewedDate);

      expect(actualUsers).toHaveLength(3);

      const usersWithoutLastReview = [actualUsers[0], actualUsers[1]];
      expect(usersWithoutLastReview).toHaveLength(2);
      expect(usersWithoutLastReview).toContainEqual(user1);
      expect(usersWithoutLastReview).toContainEqual(user2);

      expect(actualUsers[2]).toEqual(user3);
    });
  });

  describe('getInitialUsersForReview', () => {
    let user1: User;
    let user2: User;
    let user3: User;
    let user4: User;
    let user5: User;

    beforeEach(() => {
      user1 = {
        id: 'expectedUser1',
        name: 'Expected User 1',
        languages: ['Java', 'C#', 'Something obscure'],
        lastReviewedDate: 1,
      };
      user2 = {
        id: 'expectedUser2',
        name: 'Expected User 2',
        languages: ['Java', 'C#', 'Something random'],
        lastReviewedDate: 2,
      };
      user3 = {
        id: 'trimmedUser',
        name: 'Trimmed User',
        languages: ['Java', 'C#', 'Rust'],
        lastReviewedDate: 3,
      };
      user4 = {
        id: 'missing needed language',
        name: 'Unknown',
        languages: ['Java', 'Kotlin'],
        lastReviewedDate: 4,
      };
      user5 = {
        id: 'user5',
        name: 'Expected User 5',
        languages: ['Rust', 'Kotlin'],
        lastReviewedDate: 5,
      };
    });

    it('should filter users to those who have at least one matching language', async () => {
      const users: User[] = [user4, user1, user3, user2, user5];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 2);

      expect(actualUsers).toEqual([user1, user2]);
    });

    it('should return all users that match even when that is less than requested', async () => {
      const users: User[] = [user4, user1, user3, user2];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java', 'C#'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 5);

      expect(actualUsers).toEqual([user1, user2, user3, user4]);
    });

    it('should return all users that match some of the languages if there are not enough to match all of them', async () => {
      const users: User[] = [user4, user1, user3, user2, user5];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Rust', 'Kotlin'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 5);

      expect(actualUsers).toEqual([user3, user4, user5]);
    });

    it('should not return any users if there are no matches', async () => {
      const users: User[] = [user4, user1, user3, user2];
      userRepo.listAll = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Python'];

      const actualUsers = await getInitialUsersForReview(givenLanguages, 2);

      expect(actualUsers).toEqual([]);
    });
  });
});
