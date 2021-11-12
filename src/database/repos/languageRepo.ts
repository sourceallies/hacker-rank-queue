import { database } from '@database';
import { Language } from '@models/Language';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

enum Column {
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
  sheetTitle: 'languages',
  columns: Object.values(Column),

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  /**
   * @returns A list of all languages, including "Other"
   */
  async listAll(): Promise<string[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    const languages = mapRowsToLanguages(rows);

    return [...languages.map(({ name }) => name).sort(), 'Other'];
  },
};
