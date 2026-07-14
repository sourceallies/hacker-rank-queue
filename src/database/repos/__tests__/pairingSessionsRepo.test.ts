import { pairingSessionsRepo, mapRowToPairingSession } from '@repos/pairingSessionsRepo';
import { PairingSession } from '@models/PairingSession';
import { InterviewFormat } from '@bot/enums';

jest.mock('@database');

function createMockRow(data: Record<string, any>): any {
  return {
    get: (key: string) => data[key],
    set: jest.fn((key: string, value: any) => {
      data[key] = value;
    }),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

function buildPairingSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana Smith',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    requestedAt: new Date(1000000000000),
    teammatesNeededCount: 2,
    availabilityWindows: [],
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('pairingSessionsRepo', () => {
  describe('availabilityWindows column', () => {
    it('should be the last column so adding it cannot shift any existing one', () => {
      // openSheet calls setHeaderRow positionally on every open. Inserting a column mid-list would
      // relabel every column after it and misalign the data in rows already on the sheet.
      const columns = pairingSessionsRepo.columns;
      expect(columns[columns.length - 1]).toBe('availabilityWindows');
    });

    it('should read a row written before the column existed as having no windows', () => {
      const row = createMockRow({
        threadId: 'thread-1',
        requestorId: 'recruiter-1',
        candidateName: 'Dana',
        languages: 'Python',
        format: InterviewFormat.REMOTE,
        requestedAt: '1000000000000',
        teammatesNeededCount: '2',
        slots: '[]',
        pendingTeammates: '[]',
        declinedTeammates: '[]',
        // availabilityWindows absent, exactly as an older row would be.
      });

      expect(mapRowToPairingSession(row).availabilityWindows).toEqual([]);
    });
  });

  describe('mapRowToPairingSession', () => {
    it('should deserialize all fields correctly', () => {
      const interview = buildPairingSession();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        requestedAt: interview.requestedAt.getTime(),
        teammatesNeededCount: interview.teammatesNeededCount,
        slots: JSON.stringify(interview.slots),
        pendingTeammates: JSON.stringify(interview.pendingTeammates),
        declinedTeammates: JSON.stringify(interview.declinedTeammates),
      });

      const result = mapRowToPairingSession(row);

      expect(result).toEqual(interview);
    });

    it('should parse languages as an array', () => {
      const row = createMockRow({
        threadId: 't1',
        requestorId: 'r1',
        candidateName: 'Test',
        languages: 'Python,JavaScript',
        format: 'remote',
        requestedAt: 1000,
        slots: '[]',
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });

      const result = mapRowToPairingSession(row);

      expect(result.languages).toEqual(['Python', 'JavaScript']);
    });
  });

  describe('create', () => {
    it('should add a row with serialized data and return the deserialized interview', async () => {
      const interview = buildPairingSession();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        requestedAt: interview.requestedAt.getTime(),
        teammatesNeededCount: interview.teammatesNeededCount,
        slots: JSON.stringify(interview.slots),
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });
      const mockSheet = { addRow: jest.fn().mockResolvedValueOnce(row) } as any;
      pairingSessionsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      const result = await pairingSessionsRepo.create(interview);

      expect(mockSheet.addRow).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: interview.threadId,
          languages: 'Python',
          slots: JSON.stringify(interview.slots),
        }),
      );
      expect(result.threadId).toBe(interview.threadId);
    });
  });

  describe('update', () => {
    it('should update all columns and save the row', async () => {
      const interview = buildPairingSession();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });
      const mockSheet = { getRows: jest.fn().mockResolvedValueOnce([row]) } as any;
      pairingSessionsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      await pairingSessionsRepo.update(interview);

      expect(row.set).toHaveBeenCalledWith('threadId', interview.threadId);
      expect(row.set).toHaveBeenCalledWith('slots', JSON.stringify(interview.slots));
      expect(row.save).toHaveBeenCalledTimes(1);
    });

    it('should throw when interview not found', async () => {
      const mockSheet = { getRows: jest.fn().mockResolvedValueOnce([]) } as any;
      pairingSessionsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      await expect(pairingSessionsRepo.update(buildPairingSession())).rejects.toThrow(
        'PairingSession not found',
      );
    });
  });

  describe('listAll', () => {
    it('should return all pairing sessions', async () => {
      const interview = buildPairingSession();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });
      const mockSheet = { getRows: jest.fn().mockResolvedValueOnce([row]) } as any;
      pairingSessionsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      const result = await pairingSessionsRepo.listAll();

      expect(result).toHaveLength(1);
      expect(result[0].threadId).toBe('thread-1');
    });
  });
});
