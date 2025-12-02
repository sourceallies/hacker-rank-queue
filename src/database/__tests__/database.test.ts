import { database } from '@database';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

describe('database', () => {
  let mockDocument: GoogleSpreadsheet;

  beforeEach(() => {
    jest.clearAllMocks();
    const mockAuth = new JWT();
    mockDocument = new GoogleSpreadsheet('mock-id', mockAuth);
    mockDocument.addSheet = jest.fn(async ({ title }: any) => {
      const sheet: any = {
        title,
        setHeaderRow: jest.fn(),
      };
      return sheet;
    });
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
