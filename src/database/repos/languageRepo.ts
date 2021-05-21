import { database } from '@database';
import { Language } from '@models/Language';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

const enum Column {
  NAME = 'name',
}

function mapRowsToLanguages(rows: GoogleSpreadsheetRow[]): Language[] {
  return rows.map(mapRowToLanguage);
}

function mapRowToLanguage(row: GoogleSpreadsheetRow): Language {
  return {
    name: row[Column.NAME],
  };
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
    const languages = mapRowsToLanguages(rows);

    return [...languages.map(({ name }) => name).sort(), 'Other'];
  },
};
