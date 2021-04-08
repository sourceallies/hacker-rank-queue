import { database } from '@database';
import { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

const enum Column {
  NAME = 'name',
}

export const languageRepo = {
  sheetTitle: 'bot_languages',
  columns: [Column.NAME],
  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async listAll(): Promise<string[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return [...rows.map(row => row[Column.NAME] as string).sort(), 'Other'];
  },
};
