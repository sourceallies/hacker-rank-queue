import { User } from '@models/User';
import { database } from '@database';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { containsAll } from '../../utils/array';
import { sortUsersByLastReviewed } from '@utils/user';

const enum Column {
  ID = 'id',
  LANGUAGES = 'languages',
  LAST_REVIEWED_DATE = 'lastReviewedDate',
}

export function mapRowToUser(row: GoogleSpreadsheetRow): User {
  return {
    id: row[Column.ID],
    languages: row[Column.LANGUAGES].split(','),
    lastReviewedDate: row[Column.LAST_REVIEWED_DATE],
  };
}

export const userRepo = {
  sheetTitle: 'users',
  columns: [Column.ID, Column.LANGUAGES],

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async getRowByUserId(id: string): Promise<GoogleSpreadsheetRow | undefined> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.find(row => row.id === id);
  },

  async find(id: string): Promise<User | undefined> {
    const row = await this.getRowByUserId(id);
    if (row == null) return undefined;

    return mapRowToUser(row);
  },

  async create(user: User): Promise<User> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow({
      [Column.ID]: user.id,
      [Column.LANGUAGES]: user.languages.join(),
    });
    return mapRowToUser(newRow);
  },

  async update(newUser: User): Promise<User> {
    const row = await this.getRowByUserId(newUser.id);
    if (row == null) {
      console.warn('User not found:', newUser);
      throw new Error(`User not found: ${newUser.id}`);
    }
    row[Column.LANGUAGES] = newUser.languages.join();
    row[Column.LAST_REVIEWED_DATE] = newUser.lastReviewedDate;
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

  async getAllUsers(): Promise<User[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.map(mapRowToUser);
  },

  async getNextUsersToReview(languages: string[], numberOfReviewers: number): Promise<User[]> {
    const allUsers = await this.getAllUsers();

    const usersByLanguage = allUsers.filter(user => containsAll(user.languages, languages));

    return sortUsersByLastReviewed(usersByLanguage).slice(0, numberOfReviewers);
  },
};
