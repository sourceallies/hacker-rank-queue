import { User } from '@models/User';
import { database } from '@database';
import { GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

const enum Column {
  ID = 'id',
  LANGUAGES = 'languages',
}

export const userRepo = {
  sheetTitle: 'bot_users',
  columns: [Column.ID, Column.LANGUAGES],
  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async find(id: string): Promise<User | undefined> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    const row = rows.find(row => row.id === id);
    if (row == null) return undefined;

    return {
      id: row[Column.ID],
      languages: row[Column.LANGUAGES].split(','),
    };
  },
  async create(user: User): Promise<User> {
    const sheet = await this.openSheet();
    sheet.addRow({
      [Column.ID]: user.id,
      [Column.LANGUAGES]: user.languages.join(),
    });
    return user;
  },
  async update(newUser: User): Promise<User> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    const row = rows.find(row => row.id === newUser.id);
    if (row == null) {
      console.warn('User not found:', newUser);
      throw new Error('User not found: ' + newUser.id);
    }
    row[Column.LANGUAGES] = newUser.languages.join();
    await row.save();

    return {
      id: row[Column.ID],
      languages: row[Column.LANGUAGES].split(','),
    };
  },
};
