import { database } from '@database';
import { User } from '@models/User';
import { userRepo, mapRowToUser } from '@repos/userRepo';
import { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

jest.mock('@database');

describe('userRepo', () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe('mapRowToUser', () => {
    it('should map a user row to a user object', () => {
      const expectedUser = {
        id: 'guid-1',
        languages: ['Java', 'C#'],
        lastReviewedDate: Date.now(),
      };
      const row = {
        id: 'guid-1',
        languages: 'Java,C#',
        lastReviewedDate: expectedUser.lastReviewedDate,
      } as any;

      const actualUser = mapRowToUser(row);

      expect(actualUser).toEqual(expectedUser);
    });
  });

  describe('getAllUsers', () => {
    it('should open the sheet and return all mapped users', async () => {
      const expectedUsers = [
        {
          id: 'guid-1',
          languages: ['Python'],
          lastReviewedDate: undefined,
        },
        {
          id: 'guid-1',
          languages: ['Java', 'C#'],
          lastReviewedDate: Date.now(),
        },
      ];
      const rows = [
        {
          id: 'guid-1',
          languages: 'Python',
          lastReviewedDate: undefined,
        },
        {
          id: 'guid-1',
          languages: 'Java,C#',
          lastReviewedDate: expectedUsers[1].lastReviewedDate,
        },
      ];
      const mockSheet = {
        getRows: jest.fn().mockResolvedValueOnce(rows),
      } as any;
      userRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      const actualUsers = await userRepo.getAllUsers();

      expect(userRepo.openSheet).toBeCalledWith();
      expect(mockSheet.getRows).toBeCalledWith();
      expect(actualUsers).toEqual(expectedUsers);
    });
  });

  describe('getNextUsersToReview', () => {
    let matchingUser1: User;
    let matchingUser2: User;
    let matchingUser3: User;
    let nonMatchingUser1: User;

    beforeEach(() => {
      matchingUser1 = {
        id: 'expectedUser1',
        languages: ['Java', 'C#', 'Something obscure'],
        lastReviewedDate: 1,
      };
      matchingUser2 = {
        id: 'expectedUser2',
        languages: ['Java', 'C#', 'Something random'],
        lastReviewedDate: 2,
      };
      matchingUser3 = {
        id: 'trimmedUser',
        languages: ['Java', 'C#', 'Something embarrassing'],
        lastReviewedDate: 3,
      };
      nonMatchingUser1 = {
        id: 'missing needed language',
        languages: ['Java', 'language they wrote themselves'],
        lastReviewedDate: 1,
      };
    });

    it('should filter users by language and trim to number of reviewers', async () => {
      const users: User[] = [nonMatchingUser1, matchingUser1, matchingUser3, matchingUser2];
      userRepo.getAllUsers = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java', 'C#'];

      const actualUsers = await userRepo.getNextUsersToReview(givenLanguages, 2);

      expect(actualUsers).toEqual([matchingUser1, matchingUser2]);
    });

    it('should return all users that match even when that is less than requested', async () => {
      const users: User[] = [nonMatchingUser1, matchingUser1, matchingUser3, matchingUser2];
      userRepo.getAllUsers = jest.fn().mockResolvedValueOnce(users);
      const givenLanguages = ['Java', 'C#'];

      const actualUsers = await userRepo.getNextUsersToReview(givenLanguages, 5);

      expect(actualUsers).toEqual([matchingUser1, matchingUser2, matchingUser3]);
    });
  });
});
