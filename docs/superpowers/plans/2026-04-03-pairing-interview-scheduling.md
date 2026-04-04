# Pairing Interview Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the hacker-rank-queue Slack bot to support pairing interview scheduling — recruiters enter candidate availability + language + format, the bot routes DMs to qualified teammates who pick their available slots, and confirms when a valid 2-teammate combination is found.

**Architecture:** New `SHORTCUT_REQUEST_PAIRING` shortcut opens a recruiter modal. The bot DMs qualified teammates (filtered by language + interview type preference + format for in-person). Teammates respond via checkboxes selecting which time slots work for them. When any slot accumulates 2 valid teammates (hybrid requires at least 1 in-person), the interview is confirmed. Race conditions are handled by the existing `reviewLockManager`. State lives in a new `pairing_interviews` Google Sheet.

**Tech Stack:** TypeScript, `@slack/bolt` 4.6.0, Google Sheets via `google-spreadsheet`, Jest for tests. Path aliases: `@/` = `src/`, `@bot/` = `src/bot/`, `@models/` = `src/database/models/`, `@repos/` = `src/database/repos/`, `@utils/` = `src/utils/`, `@services` = `src/services/index.ts`.

---

## File Map

**New files:**

- `src/database/models/PairingInterview.ts` — `PairingInterview`, `PairingSlot`, `InterestedTeammate`, `PendingPairingTeammate`, `DeclinedPairingTeammate` interfaces
- `src/database/repos/pairingInterviewsRepo.ts` — CRUD for `pairing_interviews` sheet
- `src/database/repos/__tests__/pairingInterviewsRepo.test.ts`
- `src/services/PairingQueueService.ts` — format-aware teammate filtering and next-in-line logic
- `src/services/__tests__/PairingQueueService.test.ts`
- `src/services/PairingInterviewCloser.ts` — slot-close logic with hybrid constraint
- `src/services/__tests__/PairingInterviewCloser.test.ts`
- `src/services/PairingRequestService.ts` — DM routing, slot tracking, expiration handling
- `src/services/__tests__/PairingRequestService.test.ts`
- `src/utils/PairingRequestBuilder.ts` — Slack block builder for teammate pairing DMs
- `src/utils/__tests__/PairingRequestBuilder.test.ts`
- `src/bot/requestPairingInterview.ts` — recruiter modal shortcut + submission handler
- `src/bot/__tests__/requestPairingInterview.test.ts`
- `src/bot/acceptPairingSlot.ts` — teammate slot-selection action handler
- `src/bot/__tests__/acceptPairingSlot.test.ts`

**Modified files:**

- `src/bot/enums.ts` — add `InterviewType`, `InterviewFormat`, `InterviewTypeLabel`, `InterviewFormatLabel`, new `ActionId` values, new `Interaction` values, new `BlockId` values
- `src/database/models/User.ts` — add `interviewTypes: InterviewType[]` and `formats: InterviewFormat[]`
- `src/database/repos/userRepo.ts` — serialize/deserialize new User fields
- `src/database/repos/__tests__/userRepo.test.ts` — update `mapRowToUser` test
- `src/bot/joinQueue.ts` — add interview type + format checkboxes; fold in leave-queue button
- `src/bot/__tests__/joinQueue.test.ts` — update for new modal structure and callback behavior
- `src/bot/leaveQueue.ts` — remove (functionality folded into joinQueue)
- `src/app.ts` — register `requestPairingInterview` and `acceptPairingSlot`; remove `leaveQueue`
- `src/services/index.ts` — export `PairingQueueService`, `PairingRequestService`

---

## Task 1: Add new enums and interaction IDs to `enums.ts`

**Files:**

- Modify: `src/bot/enums.ts`

- [ ] **Step 1: Add new enums to `src/bot/enums.ts`**

Append to the end of the file:

```typescript
export const enum InterviewType {
  HACKERRANK = 'hackerrank',
  PAIRING = 'pairing',
}

export const InterviewTypeLabel = new Map<InterviewType, string>([
  [InterviewType.HACKERRANK, 'HackerRank Review'],
  [InterviewType.PAIRING, 'Pairing Interview'],
]);

export const enum InterviewFormat {
  REMOTE = 'remote',
  IN_PERSON = 'in-person',
  HYBRID = 'hybrid',
}

export const InterviewFormatLabel = new Map<InterviewFormat, string>([
  [InterviewFormat.REMOTE, 'Remote'],
  [InterviewFormat.IN_PERSON, 'In-Person'],
  [InterviewFormat.HYBRID, 'Hybrid'],
]);
```

Add to the `Interaction` const enum:

```typescript
SHORTCUT_REQUEST_PAIRING = 'shortcut-request-pairing',
SUBMIT_REQUEST_PAIRING = 'submit-request-pairing',
```

Add to the `ActionId` const enum:

```typescript
INTERVIEW_TYPE_SELECTIONS = 'interview-type-selections',
INTERVIEW_FORMAT_SELECTION = 'interview-format-selection',
CANDIDATE_NAME = 'candidate-name',
ADD_PAIRING_SLOT = 'add-pairing-slot',
PAIRING_SLOT_SELECTIONS = 'pairing-slot-selections',
PAIRING_SUBMIT_SLOTS = 'pairing-submit-slots',
PAIRING_DECLINE_ALL = 'pairing-decline-all',
```

> **Note:** Slot block IDs are computed strings (`pairing-slot-${n}-date`, etc.) — not enum members — because the slot count is dynamic. The `ADD_PAIRING_SLOT` action ID is the only new fixed ID needed for the recruiter modal.

Add to the `BlockId` const enum:

```typescript
PAIRING_DM_CONTEXT = 'pairing-dm-context',
PAIRING_DM_SLOTS = 'pairing-dm-slots',
PAIRING_DM_ACTIONS = 'pairing-dm-actions',
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/dev/hacker-rank-queue && npx tsc -p . --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/enums.ts
git commit -m "feat: add pairing interview enums and interaction IDs"
```

---

## Task 2: Expand User model and userRepo

**Files:**

- Modify: `src/database/models/User.ts`
- Modify: `src/database/repos/userRepo.ts`
- Modify: `src/database/repos/__tests__/userRepo.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/database/repos/__tests__/userRepo.test.ts`, update the `mapRowToUser` describe block to include the new fields:

```typescript
describe('mapRowToUser', () => {
  it('should map a user row to a user object with all fields', () => {
    const expectedUser = {
      id: 'guid-1',
      name: 'Test User',
      languages: ['Java', 'C#'],
      lastReviewedDate: Date.now(),
      interviewTypes: ['hackerrank', 'pairing'],
      formats: ['remote', 'in-person'],
    };
    const row = createMockRow({
      id: 'guid-1',
      name: 'Test User',
      languages: 'Java,C#',
      lastReviewedDate: expectedUser.lastReviewedDate,
      interviewTypes: 'hackerrank,pairing',
      formats: 'remote,in-person',
    });

    const actualUser = mapRowToUser(row);

    expect(actualUser).toEqual(expectedUser);
  });

  it('should default to all interview types and remote format when fields are missing', () => {
    const row = createMockRow({
      id: 'guid-1',
      name: 'Test User',
      languages: 'Python',
      lastReviewedDate: undefined,
      interviewTypes: undefined,
      formats: undefined,
    });

    const actualUser = mapRowToUser(row);

    expect(actualUser.interviewTypes).toEqual(['hackerrank', 'pairing']);
    expect(actualUser.formats).toEqual(['remote', 'in-person']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="userRepo.test"
```

Expected: FAIL — `interviewTypes` and `formats` are not on the User type.

- [ ] **Step 3: Update `src/database/models/User.ts`**

```typescript
import { InterviewFormat, InterviewType } from '@bot/enums';

export interface User {
  id: string;
  name: string;
  languages: string[];
  lastReviewedDate: number | undefined;
  interviewTypes: InterviewType[];
  formats: InterviewFormat[];
}
```

- [ ] **Step 4: Update `src/database/repos/userRepo.ts`**

Add two new columns and update `mapRowToUser`, `create`, and `update`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="userRepo.test"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/models/User.ts src/database/repos/userRepo.ts src/database/repos/__tests__/userRepo.test.ts
git commit -m "feat: add interviewTypes and formats fields to User model"
```

---

## Task 3: Update `joinQueue` to add interview type + format preferences and fold in leave

**Files:**

- Modify: `src/bot/joinQueue.ts`
- Modify: `src/bot/__tests__/joinQueue.test.ts`
- Delete: `src/bot/leaveQueue.ts` (folded in)
- Modify: `src/app.ts` (remove leaveQueue registration, remove SHORTCUT_LEAVE_QUEUE from enums)

- [ ] **Step 1: Write the failing tests**

Replace the existing content of `src/bot/__tests__/joinQueue.test.ts` with:

```typescript
import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { ActionId, InterviewFormat, InterviewType } from '@bot/enums';
import { buildMockCallbackParam, buildMockShortcutParam } from '@utils/slackMocks';
import { bold, codeBlock, compose } from '@utils/text';
import { joinQueue } from '../joinQueue';

const DIRECT_MESSAGE_ID = '1234';

describe('joinQueue', () => {
  describe('shortcut', () => {
    let shortCutParam: ShortcutParam;

    beforeEach(() => {
      shortCutParam = buildMockShortcutParam();
      languageRepo.listAll = jest.fn();
      shortCutParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });
    });

    it('should call ack', async () => {
      await joinQueue.shortcut(shortCutParam);
      expect(shortCutParam.ack).toHaveBeenCalledTimes(1);
      expect(shortCutParam.ack).toHaveBeenCalledWith();
    });

    it('should get all languages', async () => {
      await joinQueue.shortcut(shortCutParam);
      expect(languageRepo.listAll).toHaveBeenCalledTimes(1);
    });

    describe('when get all languages succeeds', () => {
      const expectedLanguages: string[] = Object.freeze(['Javascript', 'LOLCODE']) as string[];

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockResolvedValueOnce(expectedLanguages);
      });

      it('should open dialog with language, interview type, and format blocks', async () => {
        await joinQueue.shortcut(shortCutParam);

        const viewCall = (shortCutParam.client.views.open as jest.Mock).mock.calls[0][0];
        const blockIds = viewCall.view.blocks.map((b: { block_id: string }) => b.block_id);

        expect(blockIds).toContain('language-selections');
        expect(blockIds).toContain('interview-type-selections');
        expect(blockIds).toContain('interview-format-selection');
      });

      it('should include Leave Queue as a danger button', async () => {
        await joinQueue.shortcut(shortCutParam);

        const viewCall = (shortCutParam.client.views.open as jest.Mock).mock.calls[0][0];
        const allElements = viewCall.view.blocks
          .filter((b: { type: string }) => b.type === 'actions')
          .flatMap((b: { elements: unknown[] }) => b.elements);

        expect(allElements).toContainEqual(
          expect.objectContaining({ style: 'danger', action_id: 'leave-queue' }),
        );
      });
    });

    describe('when get all languages fails', () => {
      const expectedError: Error = Object.freeze(new Error('expected error'));

      beforeEach(() => {
        languageRepo.listAll = jest.fn().mockRejectedValueOnce(expectedError);
      });

      it('should post error message', async () => {
        await joinQueue.shortcut(shortCutParam);
        expect(shortCutParam.client.chat.postMessage).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('callback (join/update)', () => {
    let callbackParam: CallbackParam;
    const userId = 'test-user-id';
    const userName = 'Test User';
    const selectedLanguages = ['JavaScript', 'Python'];
    const selectedInterviewTypes = ['hackerrank', 'pairing'];
    const selectedFormats = ['remote'];

    beforeEach(() => {
      callbackParam = buildMockCallbackParam({
        body: {
          user: { id: userId, name: userName },
          view: {
            state: {
              values: {
                [ActionId.LANGUAGE_SELECTIONS]: {
                  [ActionId.LANGUAGE_SELECTIONS]: {
                    selected_options: selectedLanguages.map(lang => ({ value: lang })),
                  },
                },
                [ActionId.INTERVIEW_TYPE_SELECTIONS]: {
                  [ActionId.INTERVIEW_TYPE_SELECTIONS]: {
                    selected_options: selectedInterviewTypes.map(t => ({ value: t })),
                  },
                },
                [ActionId.INTERVIEW_FORMAT_SELECTION]: {
                  [ActionId.INTERVIEW_FORMAT_SELECTION]: {
                    selected_options: selectedFormats.map(f => ({ value: f })),
                  },
                },
              },
            },
          },
        } as any,
      });

      callbackParam.client.conversations.open = jest
        .fn()
        .mockResolvedValue({ channel: { id: DIRECT_MESSAGE_ID } });

      userRepo.find = jest.fn();
      userRepo.create = jest.fn();
      userRepo.update = jest.fn();
    });

    describe('when user does not exist', () => {
      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(null);
      });

      it('should create new user with languages, interview types, and formats', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.create).toHaveBeenCalledWith({
          id: userId,
          name: userName,
          languages: selectedLanguages,
          lastReviewedDate: undefined,
          interviewTypes: selectedInterviewTypes,
          formats: selectedFormats,
        });
      });
    });

    describe('when user already exists', () => {
      const existingUser = {
        id: userId,
        name: userName,
        languages: ['Java'],
        lastReviewedDate: 123456,
        interviewTypes: [InterviewType.HACKERRANK] as InterviewType[],
        formats: [InterviewFormat.REMOTE] as InterviewFormat[],
      };

      beforeEach(() => {
        userRepo.find = jest.fn().mockResolvedValue(existingUser);
      });

      it('should update languages, interview types, and formats', async () => {
        await joinQueue.callback(callbackParam);

        expect(userRepo.update).toHaveBeenCalledWith({
          ...existingUser,
          languages: selectedLanguages,
          interviewTypes: selectedInterviewTypes,
          formats: selectedFormats,
        });
      });
    });
  });

  describe('handleLeaveQueue action', () => {
    it('should remove user from queue and confirm via DM', async () => {
      const userId = 'user-to-leave';
      const actionParam = {
        ack: jest.fn(),
        body: {
          user: { id: userId },
          actions: [{ action_id: 'leave-queue' }],
        } as any,
        client: {
          conversations: { open: jest.fn().mockResolvedValue({ channel: { id: 'DM-123' } }) },
          chat: { postMessage: jest.fn() },
        } as any,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };
      userRepo.remove = jest.fn().mockResolvedValue({ id: userId });

      await joinQueue.handleLeaveQueue(actionParam as any);

      expect(actionParam.ack).toHaveBeenCalled();
      expect(userRepo.remove).toHaveBeenCalledWith(userId);
      expect(actionParam.client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining("You've been removed") }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="joinQueue.test"
```

Expected: FAIL — new fields and `handleLeaveQueue` don't exist yet.

- [ ] **Step 3: Rewrite `src/bot/joinQueue.ts`**

```typescript
import { ActionParam, CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { userRepo } from '@repos/userRepo';
import { App } from '@slack/bolt';
import { Option, View } from '@slack/types';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose } from '@utils/text';
import {
  ActionId,
  InterviewFormat,
  InterviewFormatLabel,
  InterviewType,
  InterviewTypeLabel,
  Interaction,
} from './enums';
import { chatService } from '@/services/ChatService';

const LEAVE_QUEUE_ACTION_ID = 'leave-queue';

export const joinQueue = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('joinQueue.setup', 'Setting up JoinQueue command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_JOIN_QUEUE, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_JOIN_QUEUE, this.callback.bind(this));
    app.action(LEAVE_QUEUE_ACTION_ID, this.handleLeaveQueue.bind(this));
  },

  dialog(languages: string[]): View {
    return {
      title: { text: 'Interview Queue Preferences', type: 'plain_text' },
      type: 'modal',
      callback_id: Interaction.SUBMIT_JOIN_QUEUE,
      blocks: [
        {
          type: 'input',
          block_id: ActionId.LANGUAGE_SELECTIONS,
          label: { text: 'What languages are you comfortable with?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.LANGUAGE_SELECTIONS,
            options: languages.map<Option>(lang => ({
              text: { text: lang, type: 'plain_text' },
              value: lang,
            })),
          },
        },
        {
          type: 'input',
          block_id: ActionId.INTERVIEW_TYPE_SELECTIONS,
          label: { text: 'Which interview types are you available for?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.INTERVIEW_TYPE_SELECTIONS,
            options: [
              {
                text: {
                  text: InterviewTypeLabel.get(InterviewType.HACKERRANK)!,
                  type: 'plain_text',
                },
                value: InterviewType.HACKERRANK,
              },
              {
                text: { text: InterviewTypeLabel.get(InterviewType.PAIRING)!, type: 'plain_text' },
                value: InterviewType.PAIRING,
              },
            ],
          },
        },
        {
          type: 'input',
          block_id: ActionId.INTERVIEW_FORMAT_SELECTION,
          label: { text: 'Which interview formats can you participate in?', type: 'plain_text' },
          element: {
            type: 'checkboxes',
            action_id: ActionId.INTERVIEW_FORMAT_SELECTION,
            options: [
              {
                text: {
                  text: InterviewFormatLabel.get(InterviewFormat.REMOTE)!,
                  type: 'plain_text',
                },
                value: InterviewFormat.REMOTE,
              },
              {
                text: {
                  text: InterviewFormatLabel.get(InterviewFormat.IN_PERSON)!,
                  type: 'plain_text',
                },
                value: InterviewFormat.IN_PERSON,
              },
            ],
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: LEAVE_QUEUE_ACTION_ID,
              text: { type: 'plain_text', text: 'Leave Queue' },
              style: 'danger',
              confirm: {
                title: { type: 'plain_text', text: 'Leave the interview queue?' },
                text: { type: 'mrkdwn', text: 'You will be removed from all interview routing.' },
                confirm: { type: 'plain_text', text: 'Leave' },
                deny: { type: 'plain_text', text: 'Cancel' },
              },
            },
          ],
        },
      ],
      submit: { type: 'plain_text', text: 'Save Preferences' },
    };
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('joinQueue.shortcut', `Opening queue preferences, user.id=${shortcut.user.id}`);
    await ack();
    try {
      const languages = await languageRepo.listAll();
      await client.views.open({ trigger_id: shortcut.trigger_id, view: this.dialog(languages) });
    } catch (err: any) {
      log.e('joinQueue.shortcut', 'Failed', err);
      await chatService.sendDirectMessage(
        client,
        shortcut.user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();
    const languages = blockUtils.getLanguageFromBody(body);
    const interviewTypes = blockUtils
      .getBlockValue(body, ActionId.INTERVIEW_TYPE_SELECTIONS)
      .selected_options.map(({ value }: { value: string }) => value) as InterviewType[];
    const formats = blockUtils
      .getBlockValue(body, ActionId.INTERVIEW_FORMAT_SELECTION)
      .selected_options.map(({ value }: { value: string }) => value) as InterviewFormat[];
    const userId = body.user.id;

    log.d('joinQueue.callback', 'Preferences submitted', {
      userId,
      languages,
      interviewTypes,
      formats,
    });

    try {
      let text: string;
      const existingUser = await userRepo.find(userId);
      if (existingUser == null) {
        await userRepo.create({
          id: userId,
          name: body.user.name,
          languages,
          interviewTypes,
          formats,
          lastReviewedDate: undefined,
        });
        text = compose(
          `You've been added to the queue! You'll receive DMs when you're selected for:`,
          bold(languages.join(', ')),
          `When it's your turn, you'll have ${process.env.REQUEST_EXPIRATION_MIN} minutes to respond.`,
        );
      } else {
        existingUser.languages = languages;
        existingUser.interviewTypes = interviewTypes;
        existingUser.formats = formats;
        await userRepo.update(existingUser);
        text = compose('Preferences updated!');
      }
      await chatService.sendDirectMessage(client, userId, text);
    } catch (err: any) {
      log.e('joinQueue.callback', 'Failed to update user', err);
      await chatService.sendDirectMessage(
        client,
        userId,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async handleLeaveQueue({ ack, body, client }: ActionParam): Promise<void> {
    await ack();
    const userId = body.user.id;
    log.d('joinQueue.handleLeaveQueue', `Removing user ${userId} from queue`);
    try {
      await userRepo.remove(userId);
      await chatService.sendDirectMessage(
        client,
        userId,
        "You've been removed from the interview queue. Use the 'Interview Queue Preferences' shortcut to rejoin.",
      );
    } catch (err: any) {
      log.e('joinQueue.handleLeaveQueue', 'Failed to remove user', err);
      await chatService.sendDirectMessage(
        client,
        userId,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="joinQueue.test"
```

Expected: PASS.

- [ ] **Step 5: Update `src/app.ts` — remove `leaveQueue`, add `joinQueue` handles the leave action**

Remove the `leaveQueue` import and `leaveQueue.setup(app)` line. The leave action is now registered inside `joinQueue.setup()`.

```typescript
// Remove these two lines:
import { leaveQueue } from '@bot/leaveQueue';
// ...
leaveQueue.setup(app);
```

- [ ] **Step 6: Delete `src/bot/leaveQueue.ts`** (or keep it empty — delete is cleaner)

```bash
rm /Users/khoehns/dev/hacker-rank-queue/src/bot/leaveQueue.ts
```

- [ ] **Step 7: Run all tests**

```bash
cd ~/dev/hacker-rank-queue && npm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/bot/joinQueue.ts src/bot/__tests__/joinQueue.test.ts src/app.ts
git rm src/bot/leaveQueue.ts
git commit -m "feat: expand joinQueue with interview type/format preferences, fold in leave action"
```

---

## Task 4: Create `PairingInterview` model and `pairingInterviewsRepo`

**Files:**

- Create: `src/database/models/PairingInterview.ts`
- Create: `src/database/repos/pairingInterviewsRepo.ts`
- Create: `src/database/repos/__tests__/pairingInterviewsRepo.test.ts`

- [ ] **Step 1: Create `src/database/models/PairingInterview.ts`**

```typescript
import { CandidateType, InterviewFormat } from '@bot/enums';

export interface PairingInterview {
  threadId: string;
  requestorId: string;
  candidateName: string;
  languages: string[];
  format: InterviewFormat;
  candidateType: CandidateType;
  slots: PairingSlot[];
  requestedAt: Date;
  pendingTeammates: PendingPairingTeammate[];
  declinedTeammates: DeclinedPairingTeammate[];
}

export interface PairingSlot {
  /** Unique ID for this slot (crypto.randomUUID()) */
  id: string;
  /** ISO date string: YYYY-MM-DD */
  date: string;
  /** 24h time: HH:MM */
  startTime: string;
  /** 24h time: HH:MM */
  endTime: string;
  interestedTeammates: InterestedTeammate[];
}

export interface InterestedTeammate {
  userId: string;
  acceptedAt: number;
  /** The user's formats at time of acceptance — used for hybrid close check */
  formats: InterviewFormat[];
}

export interface PendingPairingTeammate {
  userId: string;
  expiresAt: number;
  messageTimestamp: string;
}

export interface DeclinedPairingTeammate {
  userId: string;
  declinedAt: number;
}
```

- [ ] **Step 2: Write the failing test for `pairingInterviewsRepo`**

Create `src/database/repos/__tests__/pairingInterviewsRepo.test.ts`:

```typescript
import { pairingInterviewsRepo, mapRowToPairingInterview } from '@repos/pairingInterviewsRepo';
import { PairingInterview } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';

jest.mock('@database');

function createMockRow(data: Record<string, any>): any {
  return {
    get: (key: string) => data[key],
    set: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

function buildPairingInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana Smith',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(1000000000000),
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('pairingInterviewsRepo', () => {
  describe('mapRowToPairingInterview', () => {
    it('should deserialize all fields correctly', () => {
      const interview = buildPairingInterview();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: JSON.stringify(interview.pendingTeammates),
        declinedTeammates: JSON.stringify(interview.declinedTeammates),
      });

      const result = mapRowToPairingInterview(row);

      expect(result).toEqual(interview);
    });

    it('should parse languages as an array', () => {
      const row = createMockRow({
        threadId: 't1',
        requestorId: 'r1',
        candidateName: 'Test',
        languages: 'Python,JavaScript',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: 1000,
        slots: '[]',
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });

      const result = mapRowToPairingInterview(row);

      expect(result.languages).toEqual(['Python', 'JavaScript']);
    });
  });

  describe('listAll', () => {
    it('should return all pairing interviews', async () => {
      const interview = buildPairingInterview();
      const row = createMockRow({
        threadId: interview.threadId,
        requestorId: interview.requestorId,
        candidateName: interview.candidateName,
        languages: 'Python',
        format: 'remote',
        candidateType: 'full-time',
        requestedAt: interview.requestedAt.getTime(),
        slots: JSON.stringify(interview.slots),
        pendingTeammates: '[]',
        declinedTeammates: '[]',
      });
      const mockSheet = { getRows: jest.fn().mockResolvedValueOnce([row]) } as any;
      pairingInterviewsRepo.openSheet = jest.fn().mockResolvedValueOnce(mockSheet);

      const result = await pairingInterviewsRepo.listAll();

      expect(result).toHaveLength(1);
      expect(result[0].threadId).toBe('thread-1');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="pairingInterviewsRepo.test"
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/database/repos/pairingInterviewsRepo.ts`**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { database } from '@database';
import { PairingInterview } from '@models/PairingInterview';
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

export function mapRowToPairingInterview(row: GoogleSpreadsheetRow): PairingInterview {
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

function mapPairingInterviewToRow(interview: PairingInterview): Record<string, any> {
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

export const pairingInterviewsRepo = {
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

  async listAll(): Promise<PairingInterview[]> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    return rows.map(mapRowToPairingInterview);
  },

  async getByThreadIdOrFail(threadId: string): Promise<PairingInterview> {
    const row = await this.getRowByThreadId(threadId);
    if (!row) throw new Error(`PairingInterview not found: ${threadId}`);
    return mapRowToPairingInterview(row);
  },

  async getByThreadIdOrUndefined(threadId: string): Promise<PairingInterview | undefined> {
    const row = await this.getRowByThreadId(threadId);
    return row ? mapRowToPairingInterview(row) : undefined;
  },

  async create(interview: PairingInterview): Promise<PairingInterview> {
    const sheet = await this.openSheet();
    const newRow = await sheet.addRow(mapPairingInterviewToRow(interview));
    return mapRowToPairingInterview(newRow);
  },

  async update(interview: PairingInterview): Promise<PairingInterview> {
    const row = await this.getRowByThreadId(interview.threadId);
    if (!row) {
      log.w('pairingInterviewsRepo.update', 'Not found:', interview.threadId);
      throw new Error(`PairingInterview not found: ${interview.threadId}`);
    }
    const data = mapPairingInterviewToRow(interview);
    Object.values(Column).forEach(col => row.set(col, data[col]));
    await row.save();
    return mapRowToPairingInterview(row);
  },

  async remove(threadId: string): Promise<void> {
    const sheet = await this.openSheet();
    const rows = await sheet.getRows();
    await rows.find(row => row.get(Column.THREAD_ID) === threadId)?.delete();
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="pairingInterviewsRepo.test"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/models/PairingInterview.ts src/database/repos/pairingInterviewsRepo.ts src/database/repos/__tests__/pairingInterviewsRepo.test.ts
git commit -m "feat: add PairingInterview model and pairingInterviewsRepo"
```

---

## Task 5: Create `PairingQueueService` — format-aware teammate filtering

**Files:**

- Create: `src/services/PairingQueueService.ts`
- Create: `src/services/__tests__/PairingQueueService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/PairingQueueService.test.ts`:

```typescript
import { User } from '@models/User';
import { InterviewFormat, InterviewType } from '@bot/enums';
import {
  filterUsersForPairing,
  getInitialUsersForPairingInterview,
  nextInLineForPairing,
} from '../PairingQueueService';
import { userRepo } from '@repos/userRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { PairingInterview } from '@models/PairingInterview';
import { CandidateType } from '@bot/enums';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-' + Math.random(),
    name: 'Test User',
    languages: ['Python'],
    lastReviewedDate: undefined,
    interviewTypes: [InterviewType.PAIRING],
    formats: [InterviewFormat.REMOTE, InterviewFormat.IN_PERSON],
    ...overrides,
  };
}

function makePairingInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    slots: [],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingQueueService', () => {
  describe('filterUsersForPairing', () => {
    it('should exclude users who do not have pairing in their interviewTypes', () => {
      const hackerRankOnly = makeUser({ interviewTypes: [InterviewType.HACKERRANK] });
      const pairingUser = makeUser({ interviewTypes: [InterviewType.PAIRING] });

      const result = filterUsersForPairing(
        [hackerRankOnly, pairingUser],
        ['Python'],
        InterviewFormat.REMOTE,
      );

      expect(result).not.toContain(hackerRankOnly);
      expect(result).toContain(pairingUser);
    });

    it('should exclude users whose languages do not match', () => {
      const pythonUser = makeUser({ languages: ['Python'] });
      const javaUser = makeUser({ languages: ['Java'] });

      const result = filterUsersForPairing(
        [pythonUser, javaUser],
        ['Python'],
        InterviewFormat.REMOTE,
      );

      expect(result).toContain(pythonUser);
      expect(result).not.toContain(javaUser);
    });

    describe('format filtering', () => {
      const remoteOnlyUser = makeUser({ formats: [InterviewFormat.REMOTE] });
      const inPersonUser = makeUser({ formats: [InterviewFormat.IN_PERSON] });
      const bothUser = makeUser({ formats: [InterviewFormat.REMOTE, InterviewFormat.IN_PERSON] });

      it('should allow any user for remote interviews', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.REMOTE,
        );
        expect(result).toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });

      it('should only allow in-person users for in-person interviews', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.IN_PERSON,
        );
        expect(result).not.toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });

      it('should allow any user for hybrid interviews (close logic enforces constraint)', () => {
        const result = filterUsersForPairing(
          [remoteOnlyUser, inPersonUser, bothUser],
          ['Python'],
          InterviewFormat.HYBRID,
        );
        expect(result).toContain(remoteOnlyUser);
        expect(result).toContain(inPersonUser);
        expect(result).toContain(bothUser);
      });
    });
  });

  describe('getInitialUsersForPairingInterview', () => {
    beforeEach(() => {
      pairingInterviewsRepo.listAll = jest.fn().mockResolvedValue([]);
    });

    it('should return the requested number of eligible users sorted by lastReviewedDate', async () => {
      const user1 = makeUser({ id: 'u1', lastReviewedDate: 100 });
      const user2 = makeUser({ id: 'u2', lastReviewedDate: 200 });
      const user3 = makeUser({ id: 'u3', lastReviewedDate: 300 });
      userRepo.listAll = jest.fn().mockResolvedValueOnce([user3, user2, user1]);

      const result = await getInitialUsersForPairingInterview(
        ['Python'],
        InterviewFormat.REMOTE,
        2,
      );

      expect(result).toEqual([user1, user2]);
    });

    it('should not include users who are already pending on another pairing interview', async () => {
      const pendingUser = makeUser({ id: 'pending-user' });
      const freeUser = makeUser({ id: 'free-user', lastReviewedDate: 1 });
      userRepo.listAll = jest.fn().mockResolvedValueOnce([pendingUser, freeUser]);
      pairingInterviewsRepo.listAll = jest.fn().mockResolvedValueOnce([
        makePairingInterview({
          pendingTeammates: [
            { userId: 'pending-user', expiresAt: 9999999999, messageTimestamp: 't' },
          ],
        }),
      ]);

      const result = await getInitialUsersForPairingInterview(
        ['Python'],
        InterviewFormat.REMOTE,
        2,
      );

      expect(result).not.toContainEqual(expect.objectContaining({ id: 'pending-user' }));
      expect(result).toContainEqual(expect.objectContaining({ id: 'free-user' }));
    });
  });

  describe('nextInLineForPairing', () => {
    beforeEach(() => {
      pairingInterviewsRepo.listAll = jest.fn().mockResolvedValue([]);
    });

    it('should return undefined when no eligible users remain', async () => {
      userRepo.listAll = jest.fn().mockResolvedValueOnce([]);
      const interview = makePairingInterview();

      const result = await nextInLineForPairing(interview);

      expect(result).toBeUndefined();
    });

    it('should exclude users already pending, accepted (interested), or declined for this interview', async () => {
      const slotWithAccepted = {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [
          { userId: 'accepted-user', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
        ],
      };
      const interview = makePairingInterview({
        slots: [slotWithAccepted],
        pendingTeammates: [{ userId: 'pending-user', expiresAt: 9999999, messageTimestamp: 't' }],
        declinedTeammates: [{ userId: 'declined-user', declinedAt: 1 }],
      });
      const eligibleUser = makeUser({ id: 'eligible-user' });
      userRepo.listAll = jest
        .fn()
        .mockResolvedValueOnce([
          makeUser({ id: 'accepted-user' }),
          makeUser({ id: 'pending-user' }),
          makeUser({ id: 'declined-user' }),
          eligibleUser,
        ]);

      const result = await nextInLineForPairing(interview);

      expect(result?.userId).toBe('eligible-user');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingQueueService.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/services/PairingQueueService.ts`**

```typescript
import { User } from '@models/User';
import { PairingInterview, PendingPairingTeammate } from '@models/PairingInterview';
import { InterviewFormat, InterviewType } from '@bot/enums';
import { userRepo } from '@repos/userRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { containsAny } from '@utils/array';
import { byLastReviewedDate } from './QueueService';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import log from '@utils/log';

export function filterUsersForPairing(
  users: User[],
  languages: string[],
  format: InterviewFormat,
): User[] {
  return users
    .filter(u => u.interviewTypes.includes(InterviewType.PAIRING))
    .filter(u => containsAny(u.languages, languages))
    .filter(u => {
      if (format === InterviewFormat.IN_PERSON) {
        return u.formats.includes(InterviewFormat.IN_PERSON);
      }
      // Remote and Hybrid: anyone is eligible (hybrid close logic enforces the in-person constraint)
      return true;
    });
}

export async function getInitialUsersForPairingInterview(
  languages: string[],
  format: InterviewFormat,
  count: number,
): Promise<User[]> {
  const allUsers = await userRepo.listAll();
  const usersWithPendingInterview = await getAllUserIdsWithPendingPairingInterview();
  const excludedIds = new Set(usersWithPendingInterview);

  const eligible = filterUsersForPairing(allUsers, languages, format)
    .filter(u => !excludedIds.has(u.id))
    .sort(byLastReviewedDate);

  return eligible.slice(0, count);
}

export async function nextInLineForPairing(
  interview: PairingInterview,
): Promise<PendingPairingTeammate | undefined> {
  const allUsers = await userRepo.listAll();
  const usersWithPendingInterview = await getAllUserIdsWithPendingPairingInterview();

  const alreadyInvolvedIds = new Set<string>([
    ...interview.pendingTeammates.map(t => t.userId),
    ...interview.declinedTeammates.map(t => t.userId),
    ...interview.slots.flatMap(s => s.interestedTeammates.map(t => t.userId)),
    ...usersWithPendingInterview,
  ]);

  const [nextUser] = filterUsersForPairing(allUsers, interview.languages, interview.format)
    .filter(u => !alreadyInvolvedIds.has(u.id))
    .sort(byLastReviewedDate);

  if (!nextUser) {
    log.d('PairingQueueService.nextInLineForPairing', 'No next user found');
    return undefined;
  }

  return {
    userId: nextUser.id,
    expiresAt: determineExpirationTime(new Date()),
    messageTimestamp: '',
  };
}

async function getAllUserIdsWithPendingPairingInterview(): Promise<string[]> {
  const interviews = await pairingInterviewsRepo.listAll();
  return interviews.flatMap(i => i.pendingTeammates.map(t => t.userId));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingQueueService.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/PairingQueueService.ts src/services/__tests__/PairingQueueService.test.ts
git commit -m "feat: add PairingQueueService with format-aware teammate filtering"
```

---

## Task 6: Create `PairingInterviewCloser`

**Files:**

- Create: `src/services/PairingInterviewCloser.ts`
- Create: `src/services/__tests__/PairingInterviewCloser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/PairingInterviewCloser.test.ts`:

```typescript
import { PairingInterview, PairingSlot } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@services/ChatService';
import { pairingInterviewCloser, findConfirmedSlot } from '../PairingInterviewCloser';
import { buildMockApp } from '@utils/slackMocks';
import { App } from '@slack/bolt';

function makeSlot(overrides: Partial<PairingSlot> = {}): PairingSlot {
  return {
    id: 'slot-1',
    date: '2026-03-31',
    startTime: '13:00',
    endTime: '15:00',
    interestedTeammates: [],
    ...overrides,
  };
}

function makeInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    slots: [],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingInterviewCloser', () => {
  let app: App;

  beforeEach(() => {
    app = buildMockApp();
    chatService.replyToReviewThread = jest.fn().mockResolvedValue(undefined);
    pairingInterviewsRepo.remove = jest.fn().mockResolvedValue(undefined);
    pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn();
  });

  describe('findConfirmedSlot', () => {
    it('should return undefined when no slot has 2 interested teammates', () => {
      const slot = makeSlot({
        interestedTeammates: [{ userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] }],
      });
      const interview = makeInterview({ slots: [slot] });

      expect(findConfirmedSlot(interview)).toBeUndefined();
    });

    it('should return a slot with 2+ interested teammates for remote interviews', () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.REMOTE, slots: [slot] });

      expect(findConfirmedSlot(interview)).toEqual(slot);
    });

    it('should return a slot with 2+ interested teammates for in-person interviews', () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.IN_PERSON] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.IN_PERSON, slots: [slot] });

      expect(findConfirmedSlot(interview)).toEqual(slot);
    });

    describe('hybrid interviews', () => {
      it('should NOT confirm a slot where both teammates are remote-only', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlot(interview)).toBeUndefined();
      });

      it('should confirm a slot where at least 1 teammate is in-person capable', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlot(interview)).toEqual(slot);
      });

      it('should confirm a slot where both teammates are in-person capable', () => {
        const slot = makeSlot({
          interestedTeammates: [
            { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.IN_PERSON] },
            { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.IN_PERSON] },
          ],
        });
        const interview = makeInterview({ format: InterviewFormat.HYBRID, slots: [slot] });

        expect(findConfirmedSlot(interview)).toEqual(slot);
      });
    });
  });

  describe('closeIfComplete', () => {
    it('should not close when no confirmed slot exists', async () => {
      const slot = makeSlot({
        interestedTeammates: [{ userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] }],
      });
      const interview = makeInterview({ slots: [slot] });
      pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingInterviewCloser.closeIfComplete(app, 'thread-1');

      expect(pairingInterviewsRepo.remove).not.toHaveBeenCalled();
    });

    it('should close and notify when a slot is confirmed', async () => {
      const slot = makeSlot({
        interestedTeammates: [
          { userId: 'u1', acceptedAt: 1, formats: [InterviewFormat.REMOTE] },
          { userId: 'u2', acceptedAt: 2, formats: [InterviewFormat.REMOTE] },
        ],
      });
      const interview = makeInterview({ format: InterviewFormat.REMOTE, slots: [slot] });
      pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingInterviewCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        'thread-1',
        expect.stringContaining('2026-03-31'),
      );
      expect(pairingInterviewsRepo.remove).toHaveBeenCalledWith('thread-1');
    });

    it('should close as unfulfilled when no pending teammates remain and no slot confirmed', async () => {
      const interview = makeInterview({
        pendingTeammates: [],
        slots: [makeSlot({ interestedTeammates: [] })],
      });
      pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(interview);

      await pairingInterviewCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).toHaveBeenCalledWith(
        app.client,
        'thread-1',
        expect.stringContaining('No teammates available'),
      );
      expect(pairingInterviewsRepo.remove).toHaveBeenCalledWith('thread-1');
    });

    it('should handle a concurrently-closed interview gracefully', async () => {
      pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(undefined);

      await pairingInterviewCloser.closeIfComplete(app, 'thread-1');

      expect(chatService.replyToReviewThread).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingInterviewCloser.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/services/PairingInterviewCloser.ts`**

```typescript
import { PairingInterview, PairingSlot } from '@models/PairingInterview';
import { InterviewFormat } from '@bot/enums';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@/services/ChatService';
import { App } from '@slack/bolt';
import { mention } from '@utils/text';
import { reviewLockManager } from '@utils/reviewLockManager';
import log from '@utils/log';

export function findConfirmedSlot(interview: PairingInterview): PairingSlot | undefined {
  return interview.slots.find(slot => isSlotConfirmed(slot, interview.format));
}

function isSlotConfirmed(slot: PairingSlot, format: InterviewFormat): boolean {
  if (slot.interestedTeammates.length < 2) return false;

  if (format === InterviewFormat.HYBRID) {
    return slot.interestedTeammates.some(t => t.formats.includes(InterviewFormat.IN_PERSON));
  }

  return true;
}

export const pairingInterviewCloser = {
  async closeIfComplete(app: App, threadId: string): Promise<void> {
    const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);

    if (!interview) {
      log.d('pairingInterviewCloser', `Interview ${threadId} not found — likely already closed`);
      return;
    }

    const confirmedSlot = findConfirmedSlot(interview);

    if (confirmedSlot) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} Pairing interview for ${interview.candidateName} is confirmed! ` +
          `Slot: ${confirmedSlot.date}, ${confirmedSlot.startTime}–${confirmedSlot.endTime}. ` +
          `Teammates: ${confirmedSlot.interestedTeammates.map(t => mention({ id: t.userId })).join(' and ')}.`,
      );
      await pairingInterviewsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
      return;
    }

    const isUnfulfilled = interview.pendingTeammates.length === 0 && !findConfirmedSlot(interview);

    if (isUnfulfilled) {
      await chatService.replyToReviewThread(
        app.client,
        threadId,
        `${mention({ id: interview.requestorId })} No teammates available to cover all slots for ${interview.candidateName}'s pairing interview.`,
      );
      await pairingInterviewsRepo.remove(threadId);
      reviewLockManager.releaseLock(threadId);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingInterviewCloser.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/PairingInterviewCloser.ts src/services/__tests__/PairingInterviewCloser.test.ts
git commit -m "feat: add PairingInterviewCloser with hybrid slot constraint"
```

---

## Task 7: Create `PairingRequestBuilder`

**Files:**

- Create: `src/utils/PairingRequestBuilder.ts`
- Create: `src/utils/__tests__/PairingRequestBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/PairingRequestBuilder.test.ts`:

```typescript
import { pairingRequestBuilder } from '../PairingRequestBuilder';
import { InterviewFormat, CandidateType, ActionId, BlockId } from '@bot/enums';
import { PairingSlot } from '@models/PairingInterview';

function makeSlot(overrides: Partial<PairingSlot> = {}): PairingSlot {
  return {
    id: 'slot-abc',
    date: '2026-03-31',
    startTime: '13:00',
    endTime: '15:00',
    interestedTeammates: [],
    ...overrides,
  };
}

describe('pairingRequestBuilder', () => {
  describe('buildTeammateDM', () => {
    const slots = [makeSlot(), makeSlot({ id: 'slot-def', date: '2026-04-01' })];

    it('should include a context block with candidate info', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const contextBlock = result.find(b => b.block_id === 'pairing-dm-context');
      expect(contextBlock).toBeDefined();
      expect((contextBlock as any).text.text).toContain('Dana');
      expect((contextBlock as any).text.text).toContain('Python');
    });

    it('should include a checkboxes block with one option per slot', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const slotsBlock = result.find(b => b.block_id === 'pairing-dm-slots') as any;
      expect(slotsBlock).toBeDefined();
      expect(slotsBlock.elements[0].type).toBe('checkboxes');
      expect(slotsBlock.elements[0].options).toHaveLength(2);
      expect(slotsBlock.elements[0].options[0].value).toBe('slot-abc');
      expect(slotsBlock.elements[0].options[1].value).toBe('slot-def');
    });

    it('should include a submit button and a decline-all button in the actions block', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const actionsBlock = result.find(b => b.block_id === 'pairing-dm-actions') as any;
      expect(actionsBlock).toBeDefined();
      const actionIds = actionsBlock.elements.map((e: any) => e.action_id);
      expect(actionIds).toContain('pairing-submit-slots');
      expect(actionIds).toContain('pairing-decline-all');
    });

    it('should set button values to the threadId', () => {
      const result = pairingRequestBuilder.buildTeammateDMBlocks(
        { id: 'recruiter-1' },
        'Dana',
        ['Python'],
        InterviewFormat.REMOTE,
        CandidateType.FULL_TIME,
        slots,
        'thread-1',
      );

      const actionsBlock = result.find(b => b.block_id === 'pairing-dm-actions') as any;
      actionsBlock.elements.forEach((e: any) => {
        if (e.action_id === 'pairing-submit-slots' || e.action_id === 'pairing-decline-all') {
          expect(e.value).toBe('thread-1');
        }
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingRequestBuilder.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/utils/PairingRequestBuilder.ts`**

```typescript
import {
  ActionId,
  BlockId,
  CandidateType,
  CandidateTypeLabel,
  InterviewFormat,
  InterviewFormatLabel,
} from '@bot/enums';
import { PairingSlot } from '@models/PairingInterview';
import { compose, mention, ul } from '@utils/text';
import { Block } from '@slack/types';

function formatSlotLabel(slot: PairingSlot): string {
  return `${slot.date}, ${slot.startTime}–${slot.endTime}`;
}

export const pairingRequestBuilder = {
  buildTeammateDMBlocks(
    requestor: { id: string },
    candidateName: string,
    languages: string[],
    format: InterviewFormat,
    candidateType: CandidateType,
    slots: PairingSlot[],
    threadId: string,
  ): Block[] {
    return [
      {
        block_id: BlockId.PAIRING_DM_CONTEXT,
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: compose(
            `${mention(requestor)} needs a teammate for a pairing interview.`,
            `*Candidate:* ${candidateName} (${CandidateTypeLabel.get(candidateType) ?? candidateType})`,
            `*Languages:* ${languages.join(', ')}`,
            `*Format:* ${InterviewFormatLabel.get(format) ?? format}`,
            `\nCheck all slots you're available for:`,
          ),
        },
      } as Block,
      {
        block_id: BlockId.PAIRING_DM_SLOTS,
        type: 'actions',
        elements: [
          {
            type: 'checkboxes',
            action_id: ActionId.PAIRING_SLOT_SELECTIONS,
            options: slots.map(slot => ({
              text: { type: 'plain_text' as const, text: formatSlotLabel(slot) },
              value: slot.id,
            })),
          },
        ],
      } as Block,
      {
        block_id: BlockId.PAIRING_DM_ACTIONS,
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ActionId.PAIRING_SUBMIT_SLOTS,
            text: { type: 'plain_text', text: 'Submit availability ✅' },
            style: 'primary',
            value: threadId,
          },
          {
            type: 'button',
            action_id: ActionId.PAIRING_DECLINE_ALL,
            text: { type: 'plain_text', text: 'None of these ❌' },
            style: 'danger',
            value: threadId,
          },
        ],
      } as Block,
    ];
  },

  buildTeammateDM(
    teammateId: string,
    requestor: { id: string },
    candidateName: string,
    languages: string[],
    format: InterviewFormat,
    candidateType: CandidateType,
    slots: PairingSlot[],
    threadId: string,
  ) {
    return {
      channel: teammateId,
      text: `Pairing interview requested for ${candidateName}`,
      blocks: this.buildTeammateDMBlocks(
        requestor,
        candidateName,
        languages,
        format,
        candidateType,
        slots,
        threadId,
      ),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingRequestBuilder.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/PairingRequestBuilder.ts src/utils/__tests__/PairingRequestBuilder.test.ts
git commit -m "feat: add PairingRequestBuilder for teammate DM blocks"
```

---

## Task 8: Create `PairingRequestService`

**Files:**

- Create: `src/services/PairingRequestService.ts`
- Create: `src/services/__tests__/PairingRequestService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/PairingRequestService.test.ts`:

```typescript
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@services/ChatService';
import { pairingRequestService } from '../PairingRequestService';
import { buildMockApp } from '@utils/slackMocks';
import { PairingInterview, PairingSlot } from '@models/PairingInterview';
import { CandidateType, InterviewFormat } from '@bot/enums';
import { App } from '@slack/bolt';
import * as PairingQueueService from '../PairingQueueService';

function makeInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'recruiter-1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('PairingRequestService', () => {
  let app: App;

  beforeEach(() => {
    app = buildMockApp();
    pairingInterviewsRepo.update = jest.fn().mockImplementation(async i => i);
    chatService.updateDirectMessage = jest.fn().mockResolvedValue(undefined);
  });

  describe('declineTeammate', () => {
    it('should move teammate from pending to declined and update their DM', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
      });

      jest.spyOn(PairingQueueService, 'nextInLineForPairing').mockResolvedValue(undefined);

      await pairingRequestService.declineTeammate(app, interview, 'u1', 'No thanks');

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingTeammates: [],
          declinedTeammates: expect.arrayContaining([expect.objectContaining({ userId: 'u1' })]),
        }),
      );
    });

    it('should throw when the teammate is not in pending list', async () => {
      const interview = makeInterview({ pendingTeammates: [] });

      await expect(
        pairingRequestService.declineTeammate(app, interview, 'u1', 'msg'),
      ).rejects.toThrow('u1');
    });
  });

  describe('recordSlotSelections', () => {
    it('should add the teammate to interestedTeammates on each selected slot', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
        slots: [
          {
            id: 'slot-1',
            date: '2026-03-31',
            startTime: '09:00',
            endTime: '11:00',
            interestedTeammates: [],
          },
          {
            id: 'slot-2',
            date: '2026-03-31',
            startTime: '13:00',
            endTime: '15:00',
            interestedTeammates: [],
          },
        ],
      });

      await pairingRequestService.recordSlotSelections(
        interview,
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: expect.arrayContaining([
            expect.objectContaining({
              id: 'slot-1',
              interestedTeammates: expect.arrayContaining([
                expect.objectContaining({ userId: 'u1' }),
              ]),
            }),
            expect.objectContaining({
              id: 'slot-2',
              interestedTeammates: [],
            }),
          ]),
        }),
      );
    });

    it('should remove the teammate from pendingTeammates after recording', async () => {
      const interview = makeInterview({
        pendingTeammates: [{ userId: 'u1', expiresAt: 9999999, messageTimestamp: 'ts-1' }],
      });

      await pairingRequestService.recordSlotSelections(
        interview,
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );

      expect(pairingInterviewsRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ pendingTeammates: [] }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingRequestService.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/services/PairingRequestService.ts`**

```typescript
import { PairingInterview, PendingPairingTeammate } from '@models/PairingInterview';
import { InterviewFormat } from '@bot/enums';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { chatService } from '@/services/ChatService';
import { pairingRequestBuilder } from '@utils/PairingRequestBuilder';
import { nextInLineForPairing } from '@/services/PairingQueueService';
import { pairingInterviewCloser } from '@/services/PairingInterviewCloser';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { textBlock } from '@utils/text';
import { App } from '@slack/bolt';
import log from '@utils/log';

export const pairingRequestService = {
  /**
   * Record which slots a teammate selected and remove them from pending.
   * Does NOT check close conditions — call pairingInterviewCloser.closeIfComplete after.
   */
  async recordSlotSelections(
    interview: PairingInterview,
    userId: string,
    selectedSlotIds: string[],
    userFormats: InterviewFormat[],
  ): Promise<PairingInterview> {
    const updated: PairingInterview = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      slots: interview.slots.map(slot => {
        if (!selectedSlotIds.includes(slot.id)) return slot;
        return {
          ...slot,
          interestedTeammates: [
            ...slot.interestedTeammates,
            { userId, acceptedAt: Date.now(), formats: userFormats },
          ],
        };
      }),
    };
    await pairingInterviewsRepo.update(updated);
    return updated;
  },

  /**
   * Move a teammate from pending to declined, update their DM, and request the next person.
   */
  async declineTeammate(
    app: App,
    interview: PairingInterview,
    userId: string,
    closeMessage: string,
  ): Promise<PairingInterview> {
    const pending = interview.pendingTeammates.find(t => t.userId === userId);
    if (!pending) {
      throw new Error(
        `${userId} tried to decline ${interview.threadId} but was not in pending list`,
      );
    }

    const updated: PairingInterview = {
      ...interview,
      pendingTeammates: interview.pendingTeammates.filter(t => t.userId !== userId),
      declinedTeammates: [...interview.declinedTeammates, { userId, declinedAt: Date.now() }],
    };
    await pairingInterviewsRepo.update(updated);

    await chatService.updateDirectMessage(app.client, userId, pending.messageTimestamp, [
      textBlock(closeMessage),
    ]);

    await this.requestNextTeammate(app, updated);
    return updated;
  },

  async requestNextTeammate(app: App, interview: PairingInterview): Promise<void> {
    const next = await nextInLineForPairing(interview);
    if (!next) {
      log.d('pairingRequestService', `No next teammate for ${interview.threadId}`);
      await pairingInterviewCloser.closeIfComplete(app, interview.threadId);
      return;
    }

    const messageTimestamp = await this.sendTeammateDM(app, next.userId, interview);
    const pendingEntry: PendingPairingTeammate = {
      userId: next.userId,
      expiresAt: determineExpirationTime(new Date()),
      messageTimestamp,
    };
    const refreshed = await pairingInterviewsRepo.getByThreadIdOrFail(interview.threadId);
    refreshed.pendingTeammates.push(pendingEntry);
    await pairingInterviewsRepo.update(refreshed);
  },

  async sendTeammateDM(app: App, userId: string, interview: PairingInterview): Promise<string> {
    const dmId = await chatService.getDirectMessageId(app.client, userId);
    const payload = pairingRequestBuilder.buildTeammateDM(
      dmId,
      { id: interview.requestorId },
      interview.candidateName,
      interview.languages,
      interview.format,
      interview.candidateType,
      interview.slots,
      interview.threadId,
    );
    const message = await app.client.chat.postMessage({
      ...payload,
      token: process.env.SLACK_BOT_TOKEN,
    });
    if (!message.ts) throw new Error('No timestamp on pairing DM response');
    return message.ts;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="PairingRequestService.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/PairingRequestService.ts src/services/__tests__/PairingRequestService.test.ts
git commit -m "feat: add PairingRequestService for DM routing and slot tracking"
```

---

## Task 9: Create `requestPairingInterview` — recruiter modal with dynamic slot addition

**Files:**

- Create: `src/bot/requestPairingInterview.ts`
- Create: `src/bot/__tests__/requestPairingInterview.test.ts`

**Design:** Modal starts with 1 slot row. An "Add another slot" button fires a `block_actions` event; the handler reads current state from the payload, calls `views.update` to re-render with +1 slot and all values re-populated. Slot count is persisted in `private_metadata`. Cap at 7 slots (covers Mon–Fri with buffer). Slot block IDs are computed strings (`pairing-slot-${n}-date`, etc.) — not enum members — because `n` is dynamic.

- [ ] **Step 1: Write the failing tests**

Create `src/bot/__tests__/requestPairingInterview.test.ts`:

```typescript
import { requestPairingInterview } from '../requestPairingInterview';
import { buildMockShortcutParam, buildMockCallbackParam } from '@utils/slackMocks';
import { buildMockWebClient } from '@utils/slackMocks';
import { languageRepo } from '@repos/languageRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { ActionId, CandidateType, InterviewFormat } from '@bot/enums';
import * as PairingQueueService from '@/services/PairingQueueService';
import * as PairingRequestService from '@/services/PairingRequestService';
import { chatService } from '@/services/ChatService';

const CHANNEL_ID = 'CHANNEL-123';

describe('requestPairingInterview', () => {
  beforeEach(() => {
    process.env.INTERVIEWING_CHANNEL_ID = CHANNEL_ID;
    process.env.NUMBER_OF_INITIAL_REVIEWERS = '5';
  });

  describe('shortcut', () => {
    it('should ack and open the modal with 1 initial slot', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python', 'Java']);

      await requestPairingInterview.shortcut(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(param.client.views.open).toHaveBeenCalledTimes(1);
      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      expect(view.callback_id).toBe('submit-request-pairing');
      expect(JSON.parse(view.private_metadata)).toEqual({ slotCount: 1 });
    });

    it('should include an "Add another slot" button in the modal', async () => {
      const param = buildMockShortcutParam();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      await requestPairingInterview.shortcut(param);

      const view = (param.client.views.open as jest.Mock).mock.calls[0][0].view;
      const allActionIds = view.blocks
        .filter((b: any) => b.type === 'actions')
        .flatMap((b: any) => b.elements.map((e: any) => e.action_id));
      expect(allActionIds).toContain('add-pairing-slot');
    });
  });

  describe('handleAddSlot', () => {
    it('should call views.update with slotCount incremented by 1', async () => {
      const client = buildMockWebClient();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 2, languages: ['Python'] }),
            state: {
              values: {
                'candidate-name': { 'candidate-name': { value: 'Dana' } },
                'candidate-type': {
                  'candidate-type': {
                    selected_option: { value: 'full-time', text: { text: 'Full-time' } },
                  },
                },
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': {
                    selected_option: { value: 'remote', text: { text: 'Remote' } },
                  },
                },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
                'pairing-slot-2-date': { 'pairing-slot-2-date': { selected_date: null } },
                'pairing-slot-2-start': { 'pairing-slot-2-start': { selected_time: null } },
                'pairing-slot-2-end': { 'pairing-slot-2-end': { selected_time: null } },
              },
            },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingInterview.handleAddSlot(actionParam as any);

      expect(actionParam.ack).toHaveBeenCalledTimes(1);
      expect(client.views.update).toHaveBeenCalledTimes(1);
      const updatedView = (client.views.update as jest.Mock).mock.calls[0][0].view;
      expect(JSON.parse(updatedView.private_metadata)).toEqual(
        expect.objectContaining({ slotCount: 3 }),
      );
    });

    it('should not exceed the 7-slot cap', async () => {
      const client = buildMockWebClient();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      const stateValues: Record<string, any> = {
        'candidate-name': { 'candidate-name': { value: 'Dana' } },
        'candidate-type': {
          'candidate-type': {
            selected_option: { value: 'full-time', text: { text: 'Full-time' } },
          },
        },
        'language-selections': { 'language-selections': { selected_options: [] } },
        'interview-format-selection': {
          'interview-format-selection': {
            selected_option: { value: 'remote', text: { text: 'Remote' } },
          },
        },
      };
      for (let i = 1; i <= 7; i++) {
        stateValues[`pairing-slot-${i}-date`] = {
          [`pairing-slot-${i}-date`]: { selected_date: null },
        };
        stateValues[`pairing-slot-${i}-start`] = {
          [`pairing-slot-${i}-start`]: { selected_time: null },
        };
        stateValues[`pairing-slot-${i}-end`] = {
          [`pairing-slot-${i}-end`]: { selected_time: null },
        };
      }

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 7, languages: ['Python'] }),
            state: { values: stateValues },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingInterview.handleAddSlot(actionParam as any);

      // Should ack but not call views.update when already at cap
      expect(actionParam.ack).toHaveBeenCalledTimes(1);
      expect(client.views.update).not.toHaveBeenCalled();
    });

    it('should re-populate existing slot values when re-rendering', async () => {
      const client = buildMockWebClient();
      languageRepo.listAll = jest.fn().mockResolvedValueOnce(['Python']);

      const actionParam = {
        ack: jest.fn(),
        body: {
          view: {
            id: 'view-id-1',
            private_metadata: JSON.stringify({ slotCount: 1, languages: ['Python'] }),
            state: {
              values: {
                'candidate-name': { 'candidate-name': { value: 'Dana' } },
                'candidate-type': {
                  'candidate-type': {
                    selected_option: { value: 'full-time', text: { text: 'Full-time' } },
                  },
                },
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': {
                    selected_option: { value: 'remote', text: { text: 'Remote' } },
                  },
                },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
              },
            },
          },
        } as any,
        client,
        action: {} as any,
        payload: {} as any,
        respond: jest.fn(),
        say: jest.fn(),
        context: {} as any,
        logger: {} as any,
        next: jest.fn(),
      };

      await requestPairingInterview.handleAddSlot(actionParam as any);

      const updatedView = (client.views.update as jest.Mock).mock.calls[0][0].view;
      // The first slot's date picker should have initial_date set
      const slot1DateBlock = updatedView.blocks.find(
        (b: any) => b.block_id === 'pairing-slot-1-date',
      );
      expect(slot1DateBlock?.element?.initial_date).toBe('2026-03-31');
    });
  });

  describe('callback', () => {
    it('should ack, post to channel, DM teammates, and create the interview record', async () => {
      const mockTeammate = {
        id: 'teammate-1',
        name: 'Alice',
        languages: ['Python'],
        lastReviewedDate: undefined,
        interviewTypes: ['pairing' as any],
        formats: ['remote' as any],
      };
      jest
        .spyOn(PairingQueueService, 'getInitialUsersForPairingInterview')
        .mockResolvedValue([mockTeammate]);
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'sendTeammateDM')
        .mockResolvedValue('ts-1');
      pairingInterviewsRepo.create = jest.fn().mockImplementation(async i => i);
      chatService.postTextMessage = jest.fn().mockResolvedValue({ ts: 'thread-ts-1' });

      const callbackParam = buildMockCallbackParam({
        body: {
          user: { id: 'recruiter-1', name: 'Recruiter' },
          view: {
            private_metadata: JSON.stringify({ slotCount: 2, languages: ['Python'] }),
            state: {
              values: {
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': { selected_option: { value: 'remote' } },
                },
                'candidate-name': { 'candidate-name': { value: 'Dana Smith' } },
                'candidate-type': { 'candidate-type': { selected_option: { value: 'full-time' } } },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '13:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '15:00' } },
                'pairing-slot-2-date': { 'pairing-slot-2-date': { selected_date: '2026-04-01' } },
                'pairing-slot-2-start': { 'pairing-slot-2-start': { selected_time: '09:00' } },
                'pairing-slot-2-end': { 'pairing-slot-2-end': { selected_time: '11:00' } },
              },
            },
          },
        } as any,
      });

      await requestPairingInterview.callback(callbackParam);

      expect(callbackParam.ack).toHaveBeenCalledTimes(1);
      expect(pairingInterviewsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateName: 'Dana Smith',
          languages: ['Python'],
          format: InterviewFormat.REMOTE,
          candidateType: CandidateType.FULL_TIME,
          slots: expect.arrayContaining([
            expect.objectContaining({ date: '2026-03-31', startTime: '13:00', endTime: '15:00' }),
            expect.objectContaining({ date: '2026-04-01', startTime: '09:00', endTime: '11:00' }),
          ]),
        }),
      );
    });

    it('should read slotCount from private_metadata to parse the right number of slots', async () => {
      jest.spyOn(PairingQueueService, 'getInitialUsersForPairingInterview').mockResolvedValue([]);
      pairingInterviewsRepo.create = jest.fn().mockImplementation(async i => i);
      chatService.postTextMessage = jest.fn().mockResolvedValue({ ts: 'thread-1' });

      const callbackParam = buildMockCallbackParam({
        body: {
          user: { id: 'r1', name: 'R' },
          view: {
            private_metadata: JSON.stringify({ slotCount: 1, languages: ['Python'] }),
            state: {
              values: {
                'language-selections': {
                  'language-selections': { selected_options: [{ value: 'Python' }] },
                },
                'interview-format-selection': {
                  'interview-format-selection': { selected_option: { value: 'remote' } },
                },
                'candidate-name': { 'candidate-name': { value: 'Test' } },
                'candidate-type': { 'candidate-type': { selected_option: { value: 'full-time' } } },
                'pairing-slot-1-date': { 'pairing-slot-1-date': { selected_date: '2026-03-31' } },
                'pairing-slot-1-start': { 'pairing-slot-1-start': { selected_time: '09:00' } },
                'pairing-slot-1-end': { 'pairing-slot-1-end': { selected_time: '11:00' } },
              },
            },
          },
        } as any,
      });

      await requestPairingInterview.callback(callbackParam);

      expect(pairingInterviewsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slots: expect.arrayContaining([expect.objectContaining({ date: '2026-03-31' })]),
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="requestPairingInterview.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/bot/requestPairingInterview.ts`**

```typescript
import { ActionParam, CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { App } from '@slack/bolt';
import { Block, KnownBlock, Option, PlainTextOption, View } from '@slack/types';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { codeBlock, compose, mention } from '@utils/text';
import {
  ActionId,
  CandidateType,
  CandidateTypeLabel,
  InterviewFormat,
  InterviewFormatLabel,
  Interaction,
} from './enums';
import { chatService } from '@/services/ChatService';
import { getInitialUsersForPairingInterview } from '@/services/PairingQueueService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import { PairingSlot } from '@models/PairingInterview';

const MAX_SLOTS = 7;

interface ModalMeta {
  slotCount: number;
  languages: string[];
}

interface SlotState {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

interface ModalState {
  candidateName?: string;
  candidateType?: string;
  selectedLanguageOptions?: Option[];
  formatOption?: { value: string; text: { text: string } };
  slots: SlotState[];
}

function readStateFromBody(body: any, slotCount: number): ModalState {
  const v = body.view.state.values;
  return {
    candidateName: v['candidate-name']?.['candidate-name']?.value,
    candidateType: v['candidate-type']?.['candidate-type']?.selected_option?.value,
    selectedLanguageOptions: v['language-selections']?.['language-selections']?.selected_options,
    formatOption: v['interview-format-selection']?.['interview-format-selection']?.selected_option,
    slots: Array.from({ length: slotCount }, (_, i) => ({
      date: v[`pairing-slot-${i + 1}-date`]?.[`pairing-slot-${i + 1}-date`]?.selected_date,
      startTime: v[`pairing-slot-${i + 1}-start`]?.[`pairing-slot-${i + 1}-start`]?.selected_time,
      endTime: v[`pairing-slot-${i + 1}-end`]?.[`pairing-slot-${i + 1}-end`]?.selected_time,
    })),
  };
}

export const requestPairingInterview = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('requestPairingInterview.setup', 'Setting up RequestPairingInterview');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_PAIRING, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_REQUEST_PAIRING, this.callback.bind(this));
    app.action(ActionId.ADD_PAIRING_SLOT, this.handleAddSlot.bind(this));
  },

  dialog(languages: string[], slotCount: number, currentState?: ModalState): View {
    const meta: ModalMeta = { slotCount, languages };
    const blocks: (Block | KnownBlock)[] = [
      {
        type: 'input',
        block_id: ActionId.CANDIDATE_NAME,
        label: { text: 'Candidate name', type: 'plain_text' },
        element: {
          type: 'plain_text_input',
          action_id: ActionId.CANDIDATE_NAME,
          placeholder: { type: 'plain_text', text: 'e.g. Dana Smith' },
          ...(currentState?.candidateName ? { initial_value: currentState.candidateName } : {}),
        },
      },
      {
        type: 'input',
        block_id: ActionId.CANDIDATE_TYPE,
        label: { text: 'Candidate type', type: 'plain_text' },
        element: {
          type: 'static_select',
          action_id: ActionId.CANDIDATE_TYPE,
          options: [CandidateType.FULL_TIME, CandidateType.APPRENTICE].map<PlainTextOption>(t => ({
            text: { type: 'plain_text', text: CandidateTypeLabel.get(t) ?? t },
            value: t,
          })),
          ...(currentState?.candidateType
            ? {
                initial_option: {
                  text: {
                    type: 'plain_text' as const,
                    text:
                      CandidateTypeLabel.get(currentState.candidateType as CandidateType) ??
                      currentState.candidateType,
                  },
                  value: currentState.candidateType,
                },
              }
            : {}),
        },
      },
      {
        type: 'input',
        block_id: ActionId.LANGUAGE_SELECTIONS,
        label: { text: 'Languages', type: 'plain_text' },
        element: {
          type: 'checkboxes',
          action_id: ActionId.LANGUAGE_SELECTIONS,
          options: languages.map<Option>(lang => ({
            text: { type: 'plain_text', text: lang },
            value: lang,
          })),
          ...(currentState?.selectedLanguageOptions?.length
            ? { initial_options: currentState.selectedLanguageOptions }
            : {}),
        },
      },
      {
        type: 'input',
        block_id: ActionId.INTERVIEW_FORMAT_SELECTION,
        label: { text: 'Interview format', type: 'plain_text' },
        element: {
          type: 'static_select',
          action_id: ActionId.INTERVIEW_FORMAT_SELECTION,
          options: [
            InterviewFormat.REMOTE,
            InterviewFormat.IN_PERSON,
            InterviewFormat.HYBRID,
          ].map<PlainTextOption>(f => ({
            text: { type: 'plain_text', text: InterviewFormatLabel.get(f) ?? f },
            value: f,
          })),
          ...(currentState?.formatOption ? { initial_option: currentState.formatOption } : {}),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Candidate availability (${slotCount} slot${slotCount !== 1 ? 's' : ''}):*`,
        },
      },
      ...Array.from({ length: slotCount }, (_, i) =>
        buildSlotBlocks(i + 1, currentState?.slots[i]),
      ).flat(),
    ];

    if (slotCount < MAX_SLOTS) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ActionId.ADD_PAIRING_SLOT,
            text: { type: 'plain_text', text: '+ Add another slot' },
          },
        ],
      } as Block);
    }

    return {
      title: { text: 'Request Pairing Interview', type: 'plain_text' },
      type: 'modal',
      callback_id: Interaction.SUBMIT_REQUEST_PAIRING,
      private_metadata: JSON.stringify(meta),
      blocks,
      submit: { type: 'plain_text', text: 'Submit' },
    };
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('requestPairingInterview.shortcut', `user.id=${shortcut.user.id}`);
    await ack();
    try {
      const languages = await languageRepo.listAll();
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages, 1),
      });
    } catch (err: any) {
      await chatService.sendDirectMessage(
        client,
        shortcut.user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async handleAddSlot({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    const meta: ModalMeta = JSON.parse(
      body.view.private_metadata || '{"slotCount":1,"languages":[]}',
    );
    if (meta.slotCount >= MAX_SLOTS) {
      log.d('requestPairingInterview.handleAddSlot', 'Already at max slots');
      return;
    }

    const newSlotCount = meta.slotCount + 1;
    const currentState = readStateFromBody(body, meta.slotCount);

    await client.views.update({
      view_id: body.view.id,
      view: this.dialog(meta.languages, newSlotCount, currentState),
    });
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();

    const user = body.user;
    const meta: ModalMeta = JSON.parse(
      (body as any).view.private_metadata || '{"slotCount":1,"languages":[]}',
    );
    const candidateName = blockUtils.getBlockValue(body, ActionId.CANDIDATE_NAME).value as string;
    const languages = blockUtils.getLanguageFromBody(body);
    const format = blockUtils.getBlockValue(body, ActionId.INTERVIEW_FORMAT_SELECTION)
      .selected_option.value as InterviewFormat;
    const candidateType = blockUtils.getBlockValue(body, ActionId.CANDIDATE_TYPE).selected_option
      .value as CandidateType;
    const slots = parseSlots(body, meta.slotCount);

    if (slots.length === 0) {
      await chatService.sendDirectMessage(
        client,
        user.id,
        'Please provide at least one availability slot.',
      );
      return;
    }

    log.d('requestPairingInterview.callback', 'Parsed', {
      candidateName,
      languages,
      format,
      slots,
    });

    const channel = process.env.INTERVIEWING_CHANNEL_ID;
    const numberOfInitialReviewers = Number(process.env.NUMBER_OF_INITIAL_REVIEWERS);

    const postResult = await chatService.postTextMessage(
      client,
      channel,
      compose(
        `${mention(user)} has requested a pairing interview for *${candidateName}*.`,
        `*Languages:* ${languages.join(', ')} | *Format:* ${InterviewFormatLabel.get(format) ?? format}`,
        `*Candidate type:* ${CandidateTypeLabel.get(candidateType) ?? candidateType}`,
      ),
    );

    // @ts-expect-error Bolt types bad
    const threadId: string = postResult.ts;

    const teammates = await getInitialUsersForPairingInterview(
      languages,
      format,
      numberOfInitialReviewers,
    );

    const pendingTeammates = [];
    const interviewDraft = {
      threadId,
      requestorId: user.id,
      candidateName,
      languages,
      format,
      candidateType,
      requestedAt: new Date(),
      slots,
      pendingTeammates: [],
      declinedTeammates: [],
    };
    for (const teammate of teammates) {
      const ts = await pairingRequestService.sendTeammateDM(
        { client } as unknown as App,
        teammate.id,
        interviewDraft,
      );
      pendingTeammates.push({
        userId: teammate.id,
        expiresAt: determineExpirationTime(new Date()),
        messageTimestamp: ts,
      });
    }

    await pairingInterviewsRepo.create({ ...interviewDraft, pendingTeammates });
  },
};

function buildSlotBlocks(slotNumber: number, state?: SlotState): (Block | KnownBlock)[] {
  const dateId = `pairing-slot-${slotNumber}-date`;
  const startId = `pairing-slot-${slotNumber}-start`;
  const endId = `pairing-slot-${slotNumber}-end`;

  return [
    {
      type: 'input',
      block_id: dateId,
      label: { type: 'plain_text', text: `Slot ${slotNumber}: Date` },
      element: {
        type: 'datepicker',
        action_id: dateId,
        ...(state?.date ? { initial_date: state.date } : {}),
      },
    },
    {
      type: 'input',
      block_id: startId,
      label: { type: 'plain_text', text: `Slot ${slotNumber}: Start time` },
      element: {
        type: 'timepicker',
        action_id: startId,
        ...(state?.startTime ? { initial_time: state.startTime } : {}),
      },
    },
    {
      type: 'input',
      block_id: endId,
      label: { type: 'plain_text', text: `Slot ${slotNumber}: End time` },
      element: {
        type: 'timepicker',
        action_id: endId,
        ...(state?.endTime ? { initial_time: state.endTime } : {}),
      },
    },
  ];
}

function parseSlots(body: any, slotCount: number): PairingSlot[] {
  const slots: PairingSlot[] = [];
  for (let n = 1; n <= slotCount; n++) {
    const date =
      body.view.state.values[`pairing-slot-${n}-date`]?.[`pairing-slot-${n}-date`]?.selected_date;
    const startTime =
      body.view.state.values[`pairing-slot-${n}-start`]?.[`pairing-slot-${n}-start`]?.selected_time;
    const endTime =
      body.view.state.values[`pairing-slot-${n}-end`]?.[`pairing-slot-${n}-end`]?.selected_time;
    if (date && startTime && endTime) {
      slots.push({ id: crypto.randomUUID(), date, startTime, endTime, interestedTeammates: [] });
    }
  }
  return slots;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="requestPairingInterview.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/requestPairingInterview.ts src/bot/__tests__/requestPairingInterview.test.ts
git commit -m "feat: add requestPairingInterview with dynamic slot addition (up to 7 slots)"
```

---

## Task 10: Create `acceptPairingSlot` — teammate slot selection handler

**Files:**

- Create: `src/bot/acceptPairingSlot.ts`
- Create: `src/bot/__tests__/acceptPairingSlot.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/bot/__tests__/acceptPairingSlot.test.ts`:

```typescript
import { acceptPairingSlot } from '../acceptPairingSlot';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { userRepo } from '@repos/userRepo';
import { buildMockApp, buildMockActionParam } from '@utils/slackMocks';
import { PairingInterview } from '@models/PairingInterview';
import { CandidateType, InterviewFormat, InterviewType } from '@bot/enums';
import * as PairingRequestService from '@/services/PairingRequestService';
import * as PairingInterviewCloserModule from '@/services/PairingInterviewCloser';
import { App } from '@slack/bolt';

function makeInterview(overrides: Partial<PairingInterview> = {}): PairingInterview {
  return {
    threadId: 'thread-1',
    requestorId: 'r1',
    candidateName: 'Dana',
    languages: ['Python'],
    format: InterviewFormat.REMOTE,
    candidateType: CandidateType.FULL_TIME,
    requestedAt: new Date(),
    slots: [
      {
        id: 'slot-1',
        date: '2026-03-31',
        startTime: '13:00',
        endTime: '15:00',
        interestedTeammates: [],
      },
    ],
    pendingTeammates: [{ userId: 'u1', expiresAt: 9999999999, messageTimestamp: 'ts-1' }],
    declinedTeammates: [],
    ...overrides,
  };
}

describe('acceptPairingSlot', () => {
  let app: App;

  beforeEach(() => {
    app = buildMockApp();
    acceptPairingSlot.app = app;
    pairingInterviewsRepo.getByThreadIdOrUndefined = jest.fn().mockResolvedValue(makeInterview());
    userRepo.find = jest.fn().mockResolvedValue({
      id: 'u1',
      name: 'Alice',
      languages: ['Python'],
      lastReviewedDate: undefined,
      interviewTypes: [InterviewType.PAIRING],
      formats: [InterviewFormat.REMOTE],
    });
    jest
      .spyOn(PairingRequestService.pairingRequestService, 'recordSlotSelections')
      .mockResolvedValue(makeInterview());
    jest
      .spyOn(PairingInterviewCloserModule.pairingInterviewCloser, 'closeIfComplete')
      .mockResolvedValue(undefined);
    userRepo.markNowAsLastReviewedDate = jest.fn().mockResolvedValue(undefined);
  });

  describe('handleSubmitSlots', () => {
    it('should ack', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': {
              selected_options: [{ value: 'slot-1' }],
            },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
    });

    it('should call recordSlotSelections with the selected slot IDs', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': {
              selected_options: [{ value: 'slot-1' }],
            },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(PairingRequestService.pairingRequestService.recordSlotSelections).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        ['slot-1'],
        [InterviewFormat.REMOTE],
      );
    });

    it('should mark the user as last reviewed', async () => {
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-submit-slots' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;
      param.body.state = {
        values: {
          'pairing-dm-slots': {
            'pairing-slot-selections': { selected_options: [{ value: 'slot-1' }] },
          },
        },
      } as any;

      await acceptPairingSlot.handleSubmitSlots(param);

      expect(userRepo.markNowAsLastReviewedDate).toHaveBeenCalledWith('u1');
    });
  });

  describe('handleDeclineAll', () => {
    it('should ack and call declineTeammate', async () => {
      jest
        .spyOn(PairingRequestService.pairingRequestService, 'declineTeammate')
        .mockResolvedValue(makeInterview());
      const param = buildMockActionParam();
      param.body.actions = [{ value: 'thread-1', action_id: 'pairing-decline-all' } as any];
      param.body.user = { id: 'u1', name: 'Alice' } as any;

      await acceptPairingSlot.handleDeclineAll(param);

      expect(param.ack).toHaveBeenCalledTimes(1);
      expect(PairingRequestService.pairingRequestService.declineTeammate).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="acceptPairingSlot.test"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/bot/acceptPairingSlot.ts`**

```typescript
import { ActionParam } from '@/slackTypes';
import { App } from '@slack/bolt';
import log from '@utils/log';
import { ActionId, BlockId } from './enums';
import { userRepo } from '@repos/userRepo';
import { pairingInterviewsRepo } from '@repos/pairingInterviewsRepo';
import { pairingRequestService } from '@/services/PairingRequestService';
import { pairingInterviewCloser } from '@/services/PairingInterviewCloser';
import { reviewLockManager } from '@utils/reviewLockManager';
import { lockedExecute } from '@utils/lockedExecute';
import { reportErrorAndContinue } from '@utils/reportError';
import { textBlock } from '@utils/text';
import { chatService } from '@/services/ChatService';

export const acceptPairingSlot = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('acceptPairingSlot.setup', 'Setting up acceptPairingSlot action handlers');
    this.app = app;
    app.action(ActionId.PAIRING_SUBMIT_SLOTS, this.handleSubmitSlots.bind(this));
    app.action(ActionId.PAIRING_DECLINE_ALL, this.handleDeclineAll.bind(this));
  },

  async handleSubmitSlots({ ack, body, client }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      const messageTimestamp = body.message?.ts;
      if (!threadId || !messageTimestamp) {
        throw new Error('Missing threadId or messageTimestamp on pairing slot submit');
      }

      const selectedOptions: Array<{ value: string }> =
        (body as any).state?.values?.[BlockId.PAIRING_DM_SLOTS]?.[ActionId.PAIRING_SLOT_SELECTIONS]
          ?.selected_options ?? [];
      const selectedSlotIds = selectedOptions.map(o => o.value);

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);
        if (!interview) return;

        const isPending = interview.pendingTeammates.some(t => t.userId === userId);
        if (!isPending) {
          log.d('acceptPairingSlot', `User ${userId} already responded to ${threadId}`);
          return;
        }

        const user = await userRepo.find(userId);
        const userFormats = user?.formats ?? [];

        await pairingRequestService.recordSlotSelections(
          interview,
          userId,
          selectedSlotIds,
          userFormats,
        );
        await userRepo.markNowAsLastReviewedDate(userId);

        await chatService.updateDirectMessage(client, userId, messageTimestamp, [
          textBlock(`*Thanks! You've submitted your availability.*`),
        ]);

        await pairingInterviewCloser.closeIfComplete(this.app, threadId);
      });
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Error handling pairing slot submit', { body })(
        err as Error,
      );
    }
  },

  async handleDeclineAll({ ack, body }: ActionParam): Promise<void> {
    await ack();

    try {
      const userId = body.user.id;
      const threadId = body.actions[0].value;
      if (!threadId) throw new Error('Missing threadId on pairing decline');

      await lockedExecute(reviewLockManager.getLock(threadId), async () => {
        const interview = await pairingInterviewsRepo.getByThreadIdOrUndefined(threadId);
        if (!interview) return;

        const isPending = interview.pendingTeammates.some(t => t.userId === userId);
        if (!isPending) {
          log.d('acceptPairingSlot.handleDeclineAll', `User ${userId} already responded`);
          return;
        }

        await pairingRequestService.declineTeammate(
          this.app,
          interview,
          userId,
          "You're all set — we've moved to the next person.",
        );
      });
    } catch (err: any) {
      await reportErrorAndContinue(this.app, 'Error handling pairing decline', { body })(
        err as Error,
      );
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/dev/hacker-rank-queue && npm test -- --testPathPattern="acceptPairingSlot.test"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/acceptPairingSlot.ts src/bot/__tests__/acceptPairingSlot.test.ts
git commit -m "feat: add acceptPairingSlot handler for teammate slot selection and decline"
```

---

## Task 11: Wire up new handlers in `app.ts` and update `services/index.ts`

**Files:**

- Modify: `src/app.ts`
- Modify: `src/services/index.ts`

- [ ] **Step 1: Update `src/services/index.ts`**

```typescript
export * as QueueService from './QueueService';
export * as RequestService from './RequestService';
export * as ChatService from './ChatService';
export * as PairingQueueService from './PairingQueueService';
export * as PairingRequestService from './PairingRequestService';
```

- [ ] **Step 2: Update `src/app.ts`**

Add imports and setup calls:

```typescript
import { acceptReviewRequest } from '@bot/acceptReviewRequest';
import { declineReviewRequest } from '@bot/declineReviewRequest';
import { joinQueue } from '@bot/joinQueue';
import { requestReview } from '@bot/requestReview';
import { requestPairingInterview } from '@bot/requestPairingInterview';
import { acceptPairingSlot } from '@bot/acceptPairingSlot';
import { triggerCron } from '@bot/triggerCron';
import { requestPosition } from '@bot/requestPosition';
import { database } from '@database';
import { App, ExpressReceiver } from '@slack/bolt';
import log from '@utils/log';
import { setupCronJobs } from './cron';
import { getReviewInfo } from '@bot/getReviewInfo';

export async function startApp(): Promise<void> {
  await database.open();
  log.d('app.startApp', 'Mode:', process.env.MODE);
  log.d('app.startApp', 'Connected to Google Sheets!');

  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });
  receiver.router.get('/api/health', (_, res) => {
    res.sendStatus(204);
  });

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: receiver,
  });

  // Define shortcuts and action handlers
  joinQueue.setup(app);
  requestReview.setup(app);
  requestPairingInterview.setup(app);
  acceptReviewRequest.setup(app);
  declineReviewRequest.setup(app);
  acceptPairingSlot.setup(app);
  requestPosition.setup(app);
  getReviewInfo.setup(app);

  const triggerAllJobs = setupCronJobs(app);
  if (process.env.MODE === 'dev') {
    triggerCron.setup(app, triggerAllJobs);
  }

  let port = Number(process.env.PORT);
  if (!port || isNaN(port)) port = 3000;
  app.start(port);
  log.d('app.startApp', `Slack app started on :${port}`);
}
```

- [ ] **Step 3: Run all tests**

```bash
cd ~/dev/hacker-rank-queue && npm test
```

Expected: all tests pass, coverage thresholds met.

- [ ] **Step 4: Compile check**

```bash
cd ~/dev/hacker-rank-queue && npx tsc -p . --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/services/index.ts
git commit -m "feat: wire up pairing interview handlers in app.ts"
```

---

## Task 12: Add `SHORTCUT_REQUEST_PAIRING` to Slack app manifest

**Files:**

- Modify: Slack app configuration (done in the Slack API dashboard or `manifest.yaml` if the repo has one)

- [ ] **Step 1: Check if there is a manifest file in the repo**

```bash
ls ~/dev/hacker-rank-queue/*.yaml ~/dev/hacker-rank-queue/*.yml 2>/dev/null || echo "No manifest file found"
```

- [ ] **Step 2: If no manifest file, update the Slack app manually**

Go to [api.slack.com/apps](https://api.slack.com/apps), select the app, navigate to **Features → Interactivity & Shortcuts**, and add a new global shortcut:

| Field             | Value                                       |
| ----------------- | ------------------------------------------- |
| Name              | Request Pairing Interview                   |
| Short Description | Schedule a pairing interview with teammates |
| Callback ID       | `shortcut-request-pairing`                  |

Also remove the **Leave Queue** shortcut (callback ID: `shortcut-leave-queue`) since it's been folded into the Queue Preferences shortcut.

- [ ] **Step 3: Final smoke test**

```bash
cd ~/dev/hacker-rank-queue && npm test && npx tsc -p . --noEmit
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete pairing interview scheduling feature"
```

---

## Self-Review

### Spec coverage

| Requirement                                                                                       | Task       |
| ------------------------------------------------------------------------------------------------- | ---------- |
| Teammate interview type preference (hackerrank/pairing)                                           | Task 2 + 3 |
| Teammate format preference (remote/in-person)                                                     | Task 2 + 3 |
| Remove leaveQueue shortcut, fold into joinQueue                                                   | Task 3     |
| New `pairing_interviews` sheet                                                                    | Task 4     |
| Format-aware teammate routing (remote/in-person/hybrid rules)                                     | Task 5     |
| Hybrid: at least 1 in-person per confirmed slot                                                   | Task 6     |
| Multi-slot checkboxes in teammate DM                                                              | Task 7     |
| Recruiter modal with candidate name, language, format, dynamic slots (up to 7, "Add slot" button) | Task 9     |
| Teammate slot acceptance + decline                                                                | Task 10    |
| Race condition protection (lockedExecute)                                                         | Task 10    |
| Slack app manifest update for new shortcut                                                        | Task 12    |

### Placeholder scan

No TBD/TODO in code steps. All methods and types are defined in previous tasks before they are referenced in later tasks.

### Type consistency

- `InterviewType` and `InterviewFormat` defined in Task 1, used consistently throughout.
- `PairingInterview`, `PairingSlot`, `InterestedTeammate` defined in Task 4, used in Tasks 5–10.
- `pairingRequestService.sendTeammateDM` in Task 8 takes `(app, userId, interview)` — referenced correctly in Task 9.
- `recordSlotSelections` takes `(interview, userId, selectedSlotIds, userFormats)` — used correctly in Task 10.
- `nextInLineForPairing` returns `PendingPairingTeammate | undefined` (note: `messageTimestamp` is set to `''` as a sentinel since the actual ts is set after the DM is sent in `requestNextTeammate`) — the caller in `PairingRequestService.requestNextTeammate` overwrites it with the real ts before saving.
