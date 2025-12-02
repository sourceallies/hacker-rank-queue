import { userRepo, mapRowToUser } from '@repos/userRepo';

jest.mock('@database');

function createMockRow(data: Record<string, any>): any {
  return {
    get: (key: string) => data[key],
    set: (key: string, value: any) => {
      data[key] = value;
    },
    save: jest.fn(),
    delete: jest.fn(),
  };
}

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
      const row = createMockRow({
        id: 'guid-1',
        languages: 'Java,C#',
        lastReviewedDate: expectedUser.lastReviewedDate,
      });

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
        createMockRow({
          id: 'guid-1',
          languages: 'Python',
          lastReviewedDate: undefined,
        }),
        createMockRow({
          id: 'guid-1',
          languages: 'Java,C#',
          lastReviewedDate: expectedUsers[1].lastReviewedDate,
        }),
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
