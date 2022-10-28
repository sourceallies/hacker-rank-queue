import { database } from '@database';
import { Language } from '@models/Language';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

enum Column {
  TYPE = 'type',
}

function mapRowsToReviewTypes(rows: GoogleSpreadsheetRow[]): Language[] {
  return rows.map(mapRowToReviewType);
}

function mapRowToReviewType(row: GoogleSpreadsheetRow): Language {
  return {
    name: row[Column.TYPE],
  };
}

export const reviewTypesRepo = {
  sheetTitle: 'review_types',
  columns: Object.values(Column),

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async listAll(): Promise<string[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    const reviewTypes = mapRowsToReviewTypes(rows);

    return [...reviewTypes.map(({ name }) => name).sort()];
  },
};
