import { database } from '@database';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

jest.mock('google-spreadsheet', () => {
  return {
    GoogleSpreadsheet: jest.fn(() => ({
      useServiceAccountAuth: jest.fn(),
      loadInfo: jest.fn(),
      sheetsByTitle: {} as Record<string, GoogleSpreadsheetWorksheet>,
      addSheet: jest.fn(async ({ title }) => ({ title, setHeaderRow: jest.fn() })),
    })),
  };
});

describe('database', () => {
  let mockDocument: GoogleSpreadsheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocument = new GoogleSpreadsheet();
  });

  describe('openSheet', () => {
    it('should return an existing sheet if available', async () => {
      const mockSheet: GoogleSpreadsheetWorksheet = { setHeaderRow: jest.fn() } as any;
      mockDocument.sheetsByTitle['TestSheet'] = mockSheet;
      database.document = mockDocument;

      const sheet = await database.openSheet('TestSheet', ['col1', 'col2']);
      expect(sheet).toBe(mockSheet);
      expect(mockSheet.setHeaderRow).toHaveBeenCalledWith(['col1', 'col2']);
    });

    it('should create a new sheet if not found', async () => {
      database.document = mockDocument;
      const newSheet = await database.openSheet('NewSheet', ['colA', 'colB']);
      expect(mockDocument.addSheet).toHaveBeenCalledWith({
        title: 'NewSheet',
        headerValues: ['colA', 'colB'],
      });
      expect(newSheet.title).toBe('NewSheet');
    });
  });
});
