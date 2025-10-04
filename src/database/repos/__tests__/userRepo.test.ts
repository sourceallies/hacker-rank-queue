import { userRepo, mapRowToUser } from '@repos/userRepo';

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

  describe('listAll', () => {
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

      const actualUsers = await userRepo.listAll();

      expect(userRepo.openSheet).toHaveBeenCalledWith();
      expect(mockSheet.getRows).toHaveBeenCalledWith();
      expect(actualUsers).toEqual(expectedUsers);
    });
  });
});
