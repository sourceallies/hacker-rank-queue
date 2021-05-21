import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

export const database = {
  document: undefined as GoogleSpreadsheet | undefined,

  async open(): Promise<GoogleSpreadsheet> {
    console.info('Opening spreadsheet...');
    const document = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await document.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
      private_key: process.env.GOOGLE_PRIVATE_KEY ?? '',
    });
    await document.loadInfo();
    this.document = this.document;
    setTimeout(() => {
      console.info('Cleared cached spreadsheet after 60s');
      this.document = undefined;
    }, 60 * 1000);
    return document;
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
