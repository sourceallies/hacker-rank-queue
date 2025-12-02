import { database } from '@database';
import { User } from '@models/User';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import log from '@utils/log';

enum Column {
  ID = 'id',
  NAME = 'name',
  LANGUAGES = 'languages',
  LAST_REVIEWED_DATE = 'lastReviewedDate',
}

export function mapRowToUser(row: GoogleSpreadsheetRow): User {
  return {
    id: row.get(Column.ID),
    name: row.get(Column.NAME),
    languages: row.get(Column.LANGUAGES).split(','),
    lastReviewedDate: row.get(Column.LAST_REVIEWED_DATE),
  };
}

export const userRepo = {
  sheetTitle: 'users',
  columns: Object.values(Column),

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async getRowByUserId(id: string): Promise<GoogleSpreadsheetRow | undefined> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.find(row => row.get('id') === id);
  },

  async find(id: string): Promise<User | undefined> {
    const row = await this.getRowByUserId(id);
    if (row == null) return undefined;

    return mapRowToUser(row);
  },

  async findByIdOrFail(id: string): Promise<User> {
    const row = await this.getRowByUserId(id);
    if (row == null) {
      throw new Error(`User not found: ${id}`);
    }
    return mapRowToUser(row);
  },

  async markNowAsLastReviewedDate(id: string): Promise<void> {
    const userRecord = await this.findByIdOrFail(id);
    userRecord.lastReviewedDate = new Date().getTime();
    await this.update(userRecord);
  },

  async listAll(): Promise<User[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.map(mapRowToUser);
  },

  async create(user: User): Promise<User> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow({
      [Column.ID]: user.id,
      [Column.NAME]: user.name,
      [Column.LANGUAGES]: user.languages.join(),
    });
    return mapRowToUser(newRow);
  },

  async update(newUser: User): Promise<User> {
    const row = await this.getRowByUserId(newUser.id);
    if (row == null) {
      log.w('userRepo.update', 'User not found:', newUser);
      throw new Error(`User not found: ${newUser.id}`);
    }
    row.set(Column.LANGUAGES, newUser.languages.join());
    row.set(Column.LAST_REVIEWED_DATE, newUser.lastReviewedDate);
    await row.save();

    return mapRowToUser(row);
  },

  async remove(id: string): Promise<User | undefined> {
    const row = await this.getRowByUserId(id);
    let user: User | undefined;
    if (row) user = mapRowToUser(row);
    await row?.delete();
    return user;
  },
};
