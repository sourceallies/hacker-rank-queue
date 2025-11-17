/* eslint-disable @typescript-eslint/no-explicit-any */
import { database } from '@database';
import { ActiveReview } from '@models/ActiveReview';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import log from '@utils/log';

enum Column {
  THREAD_ID = 'threadId',
  REQUESTOR_ID = 'requestorId',
  LANGUAGES = 'languages',
  REQUESTED_AT = 'requestedAt',
  DUE_BY = 'dueBy',
  CANDIDATE_IDENTIFIER = 'candidateIdentifier',
  REVIEWERS_NEEDED_COUNT = 'reviewersNeededCount',
  ACCEPTED_REVIEWERS = 'acceptedReviewers',
  PENDING_REVIEWERS = 'pendingReviewers',
  DECLINED_REVIEWERS = 'declinedReviewers',
  HACKERRANK_URL = 'hackerRankUrl',
}

function mapRowsToActiveReviews(rows: GoogleSpreadsheetRow[]): ActiveReview[] {
  return rows.map(mapRowToActiveReview);
}

function parseDateRow(row: string): Date {
  return new Date(Number(row));
}

function mapRowToActiveReview(row: GoogleSpreadsheetRow): ActiveReview {
  return {
    threadId: row[Column.THREAD_ID],
    requestorId: row[Column.REQUESTOR_ID],
    languages: row[Column.LANGUAGES].split(','),
    requestedAt: parseDateRow(row[Column.REQUESTED_AT]),
    dueBy: row[Column.DUE_BY],
    candidateIdentifier: row[Column.CANDIDATE_IDENTIFIER],
    reviewersNeededCount: Number(row[Column.REVIEWERS_NEEDED_COUNT]),
    acceptedReviewers: JSON.parse(row[Column.ACCEPTED_REVIEWERS]),
    pendingReviewers: JSON.parse(row[Column.PENDING_REVIEWERS]),
    declinedReviewers: JSON.parse(row[Column.DECLINED_REVIEWERS]),
    hackerRankUrl: row[Column.HACKERRANK_URL],
  };
}

function mapActiveReviewToRow(activeReview: ActiveReview): Record<string, any> {
  return {
    [Column.THREAD_ID]: activeReview.threadId,
    [Column.REQUESTOR_ID]: activeReview.requestorId,
    [Column.LANGUAGES]: activeReview.languages.join(','),
    [Column.REQUESTED_AT]: activeReview.requestedAt.getTime(),
    [Column.DUE_BY]: activeReview.dueBy,
    [Column.CANDIDATE_IDENTIFIER]: activeReview.candidateIdentifier,
    [Column.REVIEWERS_NEEDED_COUNT]: activeReview.reviewersNeededCount,
    [Column.ACCEPTED_REVIEWERS]: JSON.stringify(activeReview.acceptedReviewers),
    [Column.PENDING_REVIEWERS]: JSON.stringify(activeReview.pendingReviewers),
    [Column.DECLINED_REVIEWERS]: JSON.stringify(activeReview.declinedReviewers),
    [Column.HACKERRANK_URL]: activeReview.hackerRankUrl,
  };
}

export const activeReviewRepo = {
  sheetTitle: 'active_reviews',
  columns: Object.values(Column),

  openSheet(): Promise<GoogleSpreadsheetWorksheet> {
    return database.openSheet(this.sheetTitle, this.columns);
  },

  /**
   * @returns A list of all active reviewers
   */
  async listAll(): Promise<ActiveReview[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return mapRowsToActiveReviews(rows);
  },

  /**
   * @returns the row with the given threadId, or undefined if not found
   */
  async getRowByThreadId(threadId: string): Promise<GoogleSpreadsheetRow | undefined> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.find(row => Number(row.threadId) === Number(threadId));
  },

  /**
   * @returns the review with the given threadId, or throws an error if not found
   */
  async getReviewByThreadIdOrFail(threadId: string): Promise<ActiveReview> {
    const row = await this.getRowByThreadId(threadId);
    if (!row) {
      throw new Error(`Unable to find review with threadId ${threadId}`);
    }
    return mapRowToActiveReview(row);
  },

  /**
   * @returns the review with the given threadId, or undefined if not found
   */
  async getReviewByThreadIdOrUndefined(threadId: string): Promise<ActiveReview | undefined> {
    const row = await this.getRowByThreadId(threadId);
    return row ? mapRowToActiveReview(row) : undefined;
  },

  /**
   * Creates a new active review
   * @returns The resulting active review
   */
  async create(activeReview: ActiveReview): Promise<ActiveReview> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow(mapActiveReviewToRow(activeReview));
    return mapRowToActiveReview(newRow);
  },

  async update(newActiveReview: ActiveReview): Promise<ActiveReview> {
    const row = await this.getRowByThreadId(newActiveReview.threadId);
    if (row == null) {
      log.w('activeReviewRepo.update', 'Active review not found:', newActiveReview);
      throw new Error(`Active review not found: ${newActiveReview.threadId}`);
    }
    const newRow = mapActiveReviewToRow(newActiveReview);
    Object.values(Column).forEach(column => (row[column] = newRow[column]));
    await row.save();

    return mapRowToActiveReview(row);
  },

  async remove(threadId: string): Promise<void> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    await rows.find(row => row[Column.THREAD_ID] === threadId)?.delete();
  },
};
