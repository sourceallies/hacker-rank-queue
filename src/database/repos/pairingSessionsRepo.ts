/* eslint-disable @typescript-eslint/no-explicit-any */
import { database } from '@database';
import { PairingSession } from '@models/PairingSession';
import { InterviewFormat, CandidateType } from '@bot/enums';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import log from '@utils/log';

enum Column {
  THREAD_ID = 'threadId',
  REQUESTOR_ID = 'requestorId',
  CANDIDATE_NAME = 'candidateName',
  LANGUAGES = 'languages',
  FORMAT = 'format',
  CANDIDATE_TYPE = 'candidateType',
  REQUESTED_AT = 'requestedAt',
  SLOTS = 'slots',
  PENDING_TEAMMATES = 'pendingTeammates',
  DECLINED_TEAMMATES = 'declinedTeammates',
}

export function mapRowToPairingSession(row: GoogleSpreadsheetRow): PairingSession {
  return {
    threadId: row.get(Column.THREAD_ID),
    requestorId: row.get(Column.REQUESTOR_ID),
    candidateName: row.get(Column.CANDIDATE_NAME),
    languages: row.get(Column.LANGUAGES).split(','),
    format: row.get(Column.FORMAT) as InterviewFormat,
    candidateType: row.get(Column.CANDIDATE_TYPE) as CandidateType,
    requestedAt: new Date(Number(row.get(Column.REQUESTED_AT))),
    slots: JSON.parse(row.get(Column.SLOTS)),
    pendingTeammates: JSON.parse(row.get(Column.PENDING_TEAMMATES)),
    declinedTeammates: JSON.parse(row.get(Column.DECLINED_TEAMMATES)),
  };
}

function mapPairingSessionToRow(interview: PairingSession): Record<string, any> {
  return {
    [Column.THREAD_ID]: interview.threadId,
    [Column.REQUESTOR_ID]: interview.requestorId,
    [Column.CANDIDATE_NAME]: interview.candidateName,
    [Column.LANGUAGES]: interview.languages.join(','),
    [Column.FORMAT]: interview.format,
    [Column.CANDIDATE_TYPE]: interview.candidateType,
    [Column.REQUESTED_AT]: interview.requestedAt.getTime(),
    [Column.SLOTS]: JSON.stringify(interview.slots),
    [Column.PENDING_TEAMMATES]: JSON.stringify(interview.pendingTeammates),
    [Column.DECLINED_TEAMMATES]: JSON.stringify(interview.declinedTeammates),
  };
}

export const pairingSessionsRepo = {
  sheetTitle: 'pairing_interviews',
  columns: Object.values(Column),

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  async getRowByThreadId(threadId: string): Promise<GoogleSpreadsheetRow | undefined> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.find(row => row.get(Column.THREAD_ID) === threadId);
  },

  async listAll(): Promise<PairingSession[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.map(mapRowToPairingSession);
  },

  async getByThreadIdOrFail(threadId: string): Promise<PairingSession> {
    const row = await this.getRowByThreadId(threadId);
    if (!row) throw new Error(`PairingSession not found: ${threadId}`);
    return mapRowToPairingSession(row);
  },

  async getByThreadIdOrUndefined(threadId: string): Promise<PairingSession | undefined> {
    const row = await this.getRowByThreadId(threadId);
    return row ? mapRowToPairingSession(row) : undefined;
  },

  async create(interview: PairingSession): Promise<PairingSession> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow(mapPairingSessionToRow(interview));
    return mapRowToPairingSession(newRow);
  },

  async update(interview: PairingSession): Promise<PairingSession> {
    const row = await this.getRowByThreadId(interview.threadId);
    if (!row) {
      log.w('pairingSessionsRepo.update', 'Not found:', interview.threadId);
      throw new Error(`PairingSession not found: ${interview.threadId}`);
    }
    const data = mapPairingSessionToRow(interview);
    Object.values(Column).forEach(col => row.set(col, data[col]));
    await row.save();
    return mapRowToPairingSession(row);
  },

  async remove(threadId: string): Promise<void> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    await rows.find(row => row.get(Column.THREAD_ID) === threadId)?.delete();
  },
};
