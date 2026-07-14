import { ActionParam, CallbackParam, ShortcutParam } from '@/slackTypes';
import { languageRepo } from '@repos/languageRepo';
import { pairingSessionsRepo } from '@repos/pairingSessionsRepo';
import { App } from '@slack/bolt';
import { Block, KnownBlock, Option, PlainTextOption, View } from '@slack/types';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { codeBlock, compose, mention } from '@utils/text';
import { ActionId, InterviewFormat, InterviewFormatLabel, Interaction } from './enums';
import { chatService } from '@/services/ChatService';
import { getInitialUsersForPairingSession } from '@/services/PairingQueueService';
import { pairingRequestService } from '@/services/PairingRequestService';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import {
  AvailabilityWindow,
  PairingSession,
  PairingSlot,
  PendingPairingTeammate,
} from '@models/PairingSession';
import { PAIRING_SESSION_HOURS, slotsFromWindows, validateWindow } from '@utils/pairingSlots';

/**
 * Each window becomes several bookable sessions, so this is a cap on days offered, not on slots.
 * Seven business-hours days stays comfortably inside Slack's block and button limits on the picker.
 */
const MAX_WINDOWS = 7;

interface ModalMeta {
  windowCount: number;
  languages: string[];
}

type WindowState = { [K in keyof AvailabilityWindow]?: AvailabilityWindow[K] | null };

interface ModalState {
  candidateName?: string;
  selectedLanguageOptions?: Option[];
  formatOption?: { value: string; text: { type: 'plain_text'; text: string } };
  windows: WindowState[];
}

/**
 * The single source of these ids. Block ids double as action ids, and the renderer and the reader
 * sit 300 lines apart — if they ever built the strings independently and drifted, readWindows would
 * come back undefined and the recruiter's day would vanish from the form with no error.
 */
function windowBlockIds(windowNumber: number): { date: string; start: string; end: string } {
  return {
    date: `pairing-slot-${windowNumber}-date`,
    start: `pairing-slot-${windowNumber}-start`,
    end: `pairing-slot-${windowNumber}-end`,
  };
}

function readWindows(body: any, windowCount: number): WindowState[] {
  const v = body.view.state.values;
  return Array.from({ length: windowCount }, (_, i) => {
    const ids = windowBlockIds(i + 1);
    return {
      date: v[ids.date]?.[ids.date]?.selected_date,
      startTime: v[ids.start]?.[ids.start]?.selected_time,
      endTime: v[ids.end]?.[ids.end]?.selected_time,
    };
  });
}

function readStateFromBody(body: any, windowCount: number): ModalState {
  const v = body.view.state.values;
  return {
    candidateName: v['candidate-name']?.['candidate-name']?.value,
    selectedLanguageOptions: v['language-selections']?.['language-selections']?.selected_options,
    formatOption: (() => {
      const opt = v['interview-format-selection']?.['interview-format-selection']?.selected_option;
      if (!opt) return undefined;
      return {
        value: opt.value,
        text: { type: 'plain_text' as const, text: opt.text?.text ?? '' },
      };
    })(),
    windows: readWindows(body, windowCount),
  };
}

/**
 * Slack can't constrain one timepicker against another, so an unbookable window can only be caught
 * on submit. Errors are keyed to the end-time block so they render under the field that's wrong.
 */
export function validateWindows(windows: WindowState[]): Record<string, string> {
  const errors: Record<string, string> = {};
  windows.forEach((window, i) => {
    if (!window.date || !window.startTime || !window.endTime) return;
    const error = validateWindow(window.startTime, window.endTime);
    if (error) errors[windowBlockIds(i + 1).end] = error;
  });
  return errors;
}

/** Drops windows the recruiter left blank; validateWindows has already rejected the unbookable ones. */
export function toAvailabilityWindows(windows: WindowState[]): AvailabilityWindow[] {
  return windows.flatMap(window =>
    window.date && window.startTime && window.endTime
      ? [{ date: window.date, startTime: window.startTime, endTime: window.endTime }]
      : [],
  );
}

export const requestPairingSession = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('requestPairingSession.setup', 'Setting up RequestPairingSession');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_PAIRING, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_REQUEST_PAIRING, this.callback.bind(this));
    app.action(ActionId.ADD_PAIRING_SLOT, this.handleAddWindow.bind(this));
  },

  dialog(languages: string[], windowCount: number, currentState?: ModalState): View {
    const meta: ModalMeta = { windowCount, languages };
    const blocks: (Block | KnownBlock)[] = [
      {
        type: 'input',
        block_id: ActionId.CANDIDATE_NAME,
        label: { text: 'Candidate name', type: 'plain_text' },
        element: {
          type: 'plain_text_input',
          action_id: ActionId.CANDIDATE_NAME,
          placeholder: { type: 'plain_text', text: 'e.g. Dwight S, Pam B, or Kevin' },
          ...(currentState?.candidateName ? { initial_value: currentState.candidateName } : {}),
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
      {
        type: 'input',
        block_id: ActionId.NUMBER_OF_REVIEWERS,
        label: { text: 'How many teammates are needed?', type: 'plain_text' },
        element: {
          type: 'plain_text_input',
          action_id: ActionId.NUMBER_OF_REVIEWERS,
          initial_value: '2',
          placeholder: { text: 'Enter a number...', type: 'plain_text' },
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: compose(
            '*When is the candidate available?*',
            `Enter the full window they gave you. We'll offer teammates every *${PAIRING_SESSION_HOURS} hour* session that fits inside it, so a window of 8 AM–5 PM becomes starts at 8, 9, 10, 11, 12, 1, and 2.`,
          ),
        },
      },
      ...Array.from({ length: windowCount }, (_, i) =>
        buildWindowBlocks(i + 1, currentState?.windows[i]),
      ).flat(),
    ];

    if (windowCount < MAX_WINDOWS) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ActionId.ADD_PAIRING_SLOT,
            text: { type: 'plain_text', text: '+ Add another day' },
          },
        ],
      } as Block);
    }

    return {
      title: { text: 'Request Pairing Session', type: 'plain_text' },
      type: 'modal',
      callback_id: Interaction.SUBMIT_REQUEST_PAIRING,
      private_metadata: JSON.stringify(meta),
      blocks,
      submit: { type: 'plain_text', text: 'Submit' },
    };
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('requestPairingSession.shortcut', `user.id=${shortcut.user.id}`);
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

  async handleAddWindow({ ack, body, client }: ActionParam): Promise<void> {
    await ack();
    const view = (body as any).view;
    const meta: ModalMeta = JSON.parse(
      view?.private_metadata || '{"windowCount":1,"languages":[]}',
    );
    if (meta.windowCount >= MAX_WINDOWS) {
      log.d('requestPairingSession.handleAddWindow', 'Already at max windows');
      return;
    }
    const currentState = readStateFromBody(body, meta.windowCount);
    await client.views.update({
      view_id: view.id,
      view: this.dialog(meta.languages, meta.windowCount + 1, currentState),
    });
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    const user = body.user;

    // Validation has to happen before the ack — once the modal is acked it's gone, and
    // response_action:'errors' has nothing left to attach to.
    let slots: PairingSlot[];
    let availabilityWindows: AvailabilityWindow[];
    let meta: ModalMeta;
    try {
      meta = JSON.parse((body as any).view.private_metadata || '{"windowCount":1,"languages":[]}');
      const windows = readWindows(body, meta.windowCount);
      const errors = validateWindows(windows);
      if (Object.keys(errors).length > 0) {
        await ack({ response_action: 'errors', errors });
        return;
      }
      availabilityWindows = toAvailabilityWindows(windows);
      slots = slotsFromWindows(availabilityWindows);
      if (slots.length === 0) {
        await ack({
          response_action: 'errors',
          errors: { [windowBlockIds(1).end]: 'Please provide at least one availability window.' },
        });
        return;
      }
    } catch (err: any) {
      log.e('requestPairingSession.callback', 'Failed to validate', err);
      await ack();
      await chatService.sendDirectMessage(
        client,
        user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
      return;
    }

    await ack();

    try {
      const candidateName = blockUtils.getBlockValue(body, ActionId.CANDIDATE_NAME).value as string;
      const languages = blockUtils.getLanguageFromBody(body);
      const format = blockUtils.getBlockValue(body, ActionId.INTERVIEW_FORMAT_SELECTION)
        .selected_option.value as InterviewFormat;
      const teammatesNeededCount = Number(
        blockUtils.getBlockValue(body, ActionId.NUMBER_OF_REVIEWERS).value,
      );

      const channel = process.env.INTERVIEWING_CHANNEL_ID;
      const numberOfInitialReviewers = Number(process.env.NUMBER_OF_INITIAL_REVIEWERS);

      const postResult = await chatService.postTextMessage(
        client,
        channel,
        compose(
          `${mention(user)} has requested a pairing session for *${candidateName}*.`,
          `*Languages:* ${languages.join(', ')} | *Format:* ${InterviewFormatLabel.get(format) ?? format}`,
        ),
      );

      // @ts-expect-error Bolt types bad
      const threadId: string = postResult.ts;

      const teammates = await getInitialUsersForPairingSession(
        languages,
        format,
        numberOfInitialReviewers,
      );

      const interview: PairingSession = {
        threadId,
        requestorId: user.id,
        candidateName,
        languages,
        format,
        requestedAt: new Date(),
        teammatesNeededCount,
        availabilityWindows,
        slots,
        declinedTeammates: [],
        pendingTeammates: [],
      };
      await pairingSessionsRepo.create(interview);

      // Each DM is two serialized Slack calls (open the conversation, then post), so sending them
      // one teammate at a time made the recruiter wait on 2N round trips. Promise.all preserves
      // order, so pendingTeammates still lines up with the queue.
      const pendingTeammates: PendingPairingTeammate[] = await Promise.all(
        teammates.map(async teammate => ({
          userId: teammate.id,
          expiresAt: determineExpirationTime(new Date()),
          messageTimestamp: await pairingRequestService.sendTeammateDM(
            this.app,
            teammate.id,
            interview,
          ),
        })),
      );

      if (pendingTeammates.length > 0) {
        await pairingSessionsRepo.update({ ...interview, pendingTeammates });
      }
    } catch (err: any) {
      log.e('requestPairingSession.callback', 'Failed', err);
      await chatService.sendDirectMessage(
        client,
        user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },
};

function buildWindowBlocks(windowNumber: number, state?: WindowState): (Block | KnownBlock)[] {
  const ids = windowBlockIds(windowNumber);
  return [
    {
      type: 'input',
      block_id: ids.date,
      label: { type: 'plain_text', text: `Day ${windowNumber}: Date` },
      element: {
        type: 'datepicker',
        action_id: ids.date,
        ...(state?.date ? { initial_date: state.date } : {}),
      },
    },
    {
      type: 'input',
      block_id: ids.start,
      label: { type: 'plain_text', text: `Day ${windowNumber}: Available from` },
      element: {
        type: 'timepicker',
        action_id: ids.start,
        initial_time: state?.startTime ?? '08:00',
      },
    },
    {
      type: 'input',
      block_id: ids.end,
      label: { type: 'plain_text', text: `Day ${windowNumber}: Available until` },
      element: {
        type: 'timepicker',
        action_id: ids.end,
        initial_time: state?.endTime ?? '17:00',
      },
    },
  ];
}
