import { database } from '@database';
import { User } from '@models/User';
import { InterviewFormat, InterviewType } from '@bot/enums';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import log from '@utils/log';

enum Column {
  ID = 'id',
  NAME = 'name',
  LANGUAGES = 'languages',
  LAST_REVIEWED_DATE = 'lastReviewedDate',
  LAST_PAIRING_REVIEWED_DATE = 'lastPairingReviewedDate',
  INTERVIEW_TYPES = 'interviewTypes',
  FORMATS = 'formats',
}

export function mapRowToUser(row: GoogleSpreadsheetRow): User {
  const interviewTypesRaw = row.get(Column.INTERVIEW_TYPES);
  const formatsRaw = row.get(Column.FORMATS);
  return {
    id: row.get(Column.ID),
    name: row.get(Column.NAME),
    languages: row.get(Column.LANGUAGES).split(','),
    lastReviewedDate: row.get(Column.LAST_REVIEWED_DATE),
    lastPairingReviewedDate: row.get(Column.LAST_PAIRING_REVIEWED_DATE),
    interviewTypes: interviewTypesRaw
      ? (interviewTypesRaw.split(',') as InterviewType[])
      : [InterviewType.HACKERRANK, InterviewType.PAIRING],
    formats: formatsRaw
      ? (formatsRaw.split(',') as InterviewFormat[])
      : [InterviewFormat.REMOTE, InterviewFormat.IN_PERSON],
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
    const row = await this.getRowByUserId(id);
    if (!row) throw new Error(`User not found: ${id}`);
    row.set(Column.LAST_REVIEWED_DATE, new Date().getTime());
    await row.save();
  },

  async markNowAsLastPairingReviewedDate(id: string): Promise<void> {
    const row = await this.getRowByUserId(id);
    if (!row) throw new Error(`User not found: ${id}`);
    row.set(Column.LAST_PAIRING_REVIEWED_DATE, new Date().getTime());
    await row.save();
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
      [Column.LANGUAGES]: user.languages.join(','),
      [Column.INTERVIEW_TYPES]: user.interviewTypes.join(','),
      [Column.FORMATS]: user.formats.join(','),
    });
    return mapRowToUser(newRow);
  },

  async update(newUser: User): Promise<User> {
    const row = await this.getRowByUserId(newUser.id);
    if (row == null) {
      log.w('userRepo.update', 'User not found:', newUser);
      throw new Error(`User not found: ${newUser.id}`);
    }
    row.set(Column.LANGUAGES, newUser.languages.join(','));
    row.set(Column.LAST_REVIEWED_DATE, newUser.lastReviewedDate);
    row.set(Column.LAST_PAIRING_REVIEWED_DATE, newUser.lastPairingReviewedDate);
    row.set(Column.INTERVIEW_TYPES, newUser.interviewTypes.join(','));
    row.set(Column.FORMATS, newUser.formats.join(','));
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
