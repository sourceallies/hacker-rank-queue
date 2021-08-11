/* eslint-disable @typescript-eslint/no-explicit-any */
import { database } from '@database';
import { ActiveReview, PendingReviewer } from '@models/ActiveReview';
import { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';

const enum Column {
  THREAD_ID = 'threadId',
  REQUESTOR_ID = 'requestorId',
  LANGUAGES = 'languages',
  REQUESTED_AT = 'requestedAt',
  DUE_BY = 'dueBy',
  REVIEWERS_NEEDED_COUNT = 'reviewersNeededCount',
  ACCEPTED_REVIEWERS = 'acceptedReviewers',
  PENDING_REVIEWERS = 'pendingReviewers',
  DECLINED_REVIEWERS = 'declinedReviewers',
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
    reviewersNeededCount: row[Column.REVIEWERS_NEEDED_COUNT],
    acceptedReviewers: row[Column.ACCEPTED_REVIEWERS].split(','),
    pendingReviewers: JSON.parse(row[Column.PENDING_REVIEWERS]),
    declinedReviewers: JSON.parse(row[Column.DECLINED_REVIEWERS]),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActiveReviewToRow(activeReview: ActiveReview): Record<string, any> {
  return {
    [Column.THREAD_ID]: activeReview.threadId,
    [Column.REQUESTOR_ID]: activeReview.requestorId,
    [Column.LANGUAGES]: activeReview.languages.join(','),
    [Column.REQUESTED_AT]: activeReview.requestedAt.getTime(),
    [Column.DUE_BY]: activeReview.dueBy,
    [Column.REVIEWERS_NEEDED_COUNT]: activeReview.reviewersNeededCount,
    [Column.ACCEPTED_REVIEWERS]: activeReview.acceptedReviewers.join(','),
    [Column.PENDING_REVIEWERS]: JSON.stringify(activeReview.pendingReviewers),
    [Column.DECLINED_REVIEWERS]: JSON.stringify(activeReview.declinedReviewers),
  };
}

export const activeReviewRepo = {
  sheetTitle: 'active_reviews',
  columns: [
    Column.THREAD_ID,
    Column.REQUESTOR_ID,
    Column.LANGUAGES,
    Column.REQUESTED_AT,
    Column.DUE_BY,
    Column.REVIEWERS_NEEDED_COUNT,
    Column.ACCEPTED_REVIEWERS,
    Column.PENDING_REVIEWERS,
    Column.DECLINED_REVIEWERS,
  ],

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
   * Creates a new active review
   * @returns The resulting active review
   */
  async create(activeReview: ActiveReview): Promise<ActiveReview> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow(mapActiveReviewToRow(activeReview));
    return mapRowToActiveReview(newRow);
  },

  async update(activeReview: ActiveReview): Promise<void> {
    throw Error('Not implemented: activeReviewsRepo.update');
  },

  async remove(threadId: string): Promise<void> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    await rows.find(row => row[Column.THREAD_ID] === threadId)?.delete();
  },
};
