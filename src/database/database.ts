import log from '@utils/log';
import { lockedExecute } from '@utils/lockedExecute';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { Lock } from 'lock';

const openLock = Lock();

export const database = {
  document: undefined as GoogleSpreadsheet | undefined,

  async open(): Promise<GoogleSpreadsheet> {
    return await lockedExecute(openLock, async () => {
      if (this.document != null) return this.document;

      log.d('database', 'Opening spreadsheet...');
      const newDocument = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
      await newDocument.useServiceAccountAuth({
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
        private_key: process.env.GOOGLE_PRIVATE_KEY ?? '',
      });
      await newDocument.loadInfo();
      this.document = newDocument;
      setTimeout(() => {
        console.info('Cleared cached spreadsheet after 60s');
        this.document = undefined;
      }, 60 * 1000);
      return newDocument;
    });
  },

  async openSheet(sheetTitle: string, columns: string[]): Promise<GoogleSpreadsheetWorksheet> {
    const doc = this.document ?? (await this.open());
    const sheet = doc.sheetsByTitle[sheetTitle];
    if (sheet != null) {
      sheet.setHeaderRow(columns);
      return sheet;
    }

    return await doc.addSheet({ title: sheetTitle, headerValues: columns });
  },
};
