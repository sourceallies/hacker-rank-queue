import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

export const database = {
  async open(): Promise<GoogleSpreadsheet> {
    const document = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await document.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
      private_key: process.env.GOOGLE_PRIVATE_KEY ?? '',
    });
    await document.loadInfo();
    return document;
  },

  async openSheet(sheetTitle: string, columns: string[]): Promise<GoogleSpreadsheetWorksheet> {
    const doc = await this.open();
    const sheet = doc.sheetsByTitle[sheetTitle];
    if (sheet != null) {
      sheet.setHeaderRow(columns);
      return sheet;
    }

    return await doc.addSheet({ title: sheetTitle, headerValues: columns });
  },
};
