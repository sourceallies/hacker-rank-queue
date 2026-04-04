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
import { PairingInterview, PairingSlot, PendingPairingTeammate } from '@models/PairingInterview';

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
  formatOption?: { value: string; text: { type: 'plain_text'; text: string } };
  slots: SlotState[];
}

function readStateFromBody(body: any, slotCount: number): ModalState {
  const v = body.view.state.values;
  return {
    candidateName: v['candidate-name']?.['candidate-name']?.value,
    candidateType: v['candidate-type']?.['candidate-type']?.selected_option?.value,
    selectedLanguageOptions: v['language-selections']?.['language-selections']?.selected_options,
    formatOption: (() => {
      const opt = v['interview-format-selection']?.['interview-format-selection']?.selected_option;
      if (!opt) return undefined;
      return {
        value: opt.value,
        text: { type: 'plain_text' as const, text: opt.text?.text ?? '' },
      };
    })(),
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
      title: { text: 'Request Pairing Session', type: 'plain_text' },
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
    const view = (body as any).view;
    const meta: ModalMeta = JSON.parse(view?.private_metadata || '{"slotCount":1,"languages":[]}');
    if (meta.slotCount >= MAX_SLOTS) {
      log.d('requestPairingInterview.handleAddSlot', 'Already at max slots');
      return;
    }
    const newSlotCount = meta.slotCount + 1;
    const currentState = readStateFromBody(body, meta.slotCount);
    await client.views.update({
      view_id: view.id,
      view: this.dialog(meta.languages, newSlotCount, currentState),
    });
  },

  async callback({ ack, client, body }: CallbackParam): Promise<void> {
    await ack();
    const user = body.user;
    try {
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

      const channel = process.env.INTERVIEWING_CHANNEL_ID;
      const numberOfInitialReviewers = Number(process.env.NUMBER_OF_INITIAL_REVIEWERS);

      const postResult = await chatService.postTextMessage(
        client,
        channel,
        compose(
          `${mention(user)} has requested a pairing session for *${candidateName}*.`,
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

      const interview: PairingInterview = {
        threadId,
        requestorId: user.id,
        candidateName,
        languages,
        format,
        candidateType,
        requestedAt: new Date(),
        slots,
        declinedTeammates: [],
        pendingTeammates: [],
      };
      await pairingInterviewsRepo.create(interview);

      const pendingTeammates: PendingPairingTeammate[] = [];
      for (const teammate of teammates) {
        const ts = await pairingRequestService.sendTeammateDM(this.app, teammate.id, interview);
        pendingTeammates.push({
          userId: teammate.id,
          expiresAt: determineExpirationTime(new Date()),
          messageTimestamp: ts,
        });
      }

      if (pendingTeammates.length > 0) {
        await pairingInterviewsRepo.update({ ...interview, pendingTeammates });
      }
    } catch (err: any) {
      log.e('requestPairingInterview.callback', 'Failed', err);
      await chatService.sendDirectMessage(
        client,
        user.id,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
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
