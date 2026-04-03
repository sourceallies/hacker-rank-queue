import { pairingInterviewsRepo, mapRowToPairingInterview } from '@repos/pairingInterviewsRepo';
import { PairingInterview } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';

jest.mock('@database');

function createMockRow(data: Record<string, any>): any {
  return {
    get: (key: string) => data[key],
    set: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

function buildPairingInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana Smith',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(1000000000000),
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

describe('pairingInterviewsRepo', () => {
  describe('mapRowToPairingInterview', () => {
    it('should deserialize all fields correctly', () => {
      const interview = buildPairingInterview();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: JSON.stringify(interview.pendingTeammates),
        declinedTeammates: JSON.stringify(interview.declinedTeammates),
      });

      const result = mapRowToPairingInterview(row);

      expect(result).toEqual(interview);
    });

    it('should parse languages as an array', () => {
      const row = createMockRow({
        threadId: 't1',
        requestorId: 'r1',
        candidateName: 'Test',
        languages: 'Python,JavaScript',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: 1000,
        slots: '[]',
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });

      const result = mapRowToPairingInterview(row);

      expect(result.languages).toEqual(['Python', 'JavaScript']);
    });
  });

  describe('listAll', () => {
    it('should return all pairing interviews', async () => {
      const interview = buildPairingInterview();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });
      const mockSheet = { getRows: jest.fn().mockResolvedValueOnce([row]) } as any;
      pairingInterviewsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      const result = await pairingInterviewsRepo.listAll();

      expect(result).toHaveLength(1);
      expect(result[0].threadId).toBe('thread-1');
    });
  });
});
