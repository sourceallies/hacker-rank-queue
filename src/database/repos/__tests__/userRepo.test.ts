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
    it('should map a user row to a user object with all fields', () => {
      const expectedUser = {
        id: 'guid-1',
        name: 'Test User',
        languages: ['Java', 'C#'],
        lastReviewedDate: Date.now(),
        lastPairingReviewedDate: undefined,
        interviewTypes: ['hackerrank', 'pairing'],
        formats: ['remote', 'in-person'],
      };
      const row = createMockRow({
        id: 'guid-1',
        name: 'Test User',
        languages: 'Java,C#',
        lastReviewedDate: expectedUser.lastReviewedDate,
        lastPairingReviewedDate: undefined,
        interviewTypes: 'hackerrank,pairing',
        formats: 'remote,in-person',
      });

      const actualUser = mapRowToUser(row);

      expect(actualUser).toEqual(expectedUser);
    });

    it('should default to all interview types and both formats when fields are missing', () => {
      const row = createMockRow({
        id: 'guid-1',
        name: 'Test User',
        languages: 'Python',
        lastReviewedDate: undefined,
        lastPairingReviewedDate: undefined,
        interviewTypes: undefined,
        formats: undefined,
      });

      const actualUser = mapRowToUser(row);

      expect(actualUser.interviewTypes).toEqual(['hackerrank', 'pairing']);
      expect(actualUser.formats).toEqual(['remote', 'in-person']);
    });
  });

  describe('listAll', () => {
    it('should open the sheet and return all mapped users', async () => {
      const expectedUsers = [
        {
          id: 'guid-1',
          name: undefined,
          languages: ['Python'],
          lastReviewedDate: undefined,
          lastPairingReviewedDate: undefined,
          interviewTypes: ['hackerrank', 'pairing'],
          formats: ['remote', 'in-person'],
        },
        {
          id: 'guid-1',
          name: undefined,
          languages: ['Java', 'C#'],
          lastReviewedDate: Date.now(),
          lastPairingReviewedDate: undefined,
          interviewTypes: ['hackerrank', 'pairing'],
          formats: ['remote', 'in-person'],
        },
      ];
      const rows = [
        createMockRow({
          id: 'guid-1',
          languages: 'Python',
          lastReviewedDate: undefined,
          lastPairingReviewedDate: undefined,
          interviewTypes: 'hackerrank,pairing',
          formats: 'remote,in-person',
        }),
        createMockRow({
          id: 'guid-1',
          languages: 'Java,C#',
          lastReviewedDate: expectedUsers[1].lastReviewedDate,
          lastPairingReviewedDate: undefined,
          interviewTypes: 'hackerrank,pairing',
          formats: 'remote,in-person',
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
