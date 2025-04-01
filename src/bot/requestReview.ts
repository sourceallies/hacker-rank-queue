import { CallbackParam, ShortcutParam } from '@/slackTypes';
import { isViewSubmitActionParam } from '@/typeGuards';
import { activeReviewRepo } from '@repos/activeReviewsRepo';
import { languageRepo } from '@repos/languageRepo';
import { QueueService } from '@services';
import { App, Block, KnownBlock, PlainTextOption, View } from '@slack/bolt';
import { blockUtils } from '@utils/blocks';
import log from '@utils/log';
import { bold, codeBlock, compose, italic, mention, ul } from '@utils/text';
import { PendingReviewer } from '@models/ActiveReview';
import { ActionId, Deadline, DeadlineLabel, Interaction } from './enums';
import { chatService } from '@/services/ChatService';
import { determineExpirationTime } from '@utils/reviewExpirationUtils';
import {
  HackParserIntegrationEnabled,
  uploadPDFToHackParserS3,
} from '@/services/HackParserService';
import { downloadUserUploadedFile } from '@/utils/files';

export const waitForHackParser = async () => {
  await new Promise(resolve => setTimeout(resolve, 120_000));
};

export const requestReview = {
  app: undefined as unknown as App,

  setup(app: App): void {
    log.d('requestReview.setup', 'Setting up RequestReview command');
    this.app = app;
    app.shortcut(Interaction.SHORTCUT_REQUEST_REVIEW, this.shortcut.bind(this));
    app.view(Interaction.SUBMIT_REQUEST_REVIEW, this.callback.bind(this));
  },

  dialog(languages: string[]): View {
    const blocks: (Block | KnownBlock)[] = [
      {
        type: 'input',
        block_id: ActionId.LANGUAGE_SELECTIONS,
        label: {
          text: 'What languages were used?',
          type: 'plain_text',
        },
        element: {
          type: 'checkboxes',
          action_id: ActionId.LANGUAGE_SELECTIONS,
          options: languages.map(language => ({
            text: { text: language, type: 'plain_text' as const },
            value: language,
          })),
        },
      },
      {
        type: 'input',
        block_id: ActionId.REVIEW_DEADLINE,
        label: {
          text: 'When do you need this reviewed by?',
          type: 'plain_text',
        },
        element: {
          type: 'static_select',
          action_id: ActionId.REVIEW_DEADLINE,
          options: buildDeadlineOptions(),
        },
      },
      {
        type: 'input',
        block_id: ActionId.NUMBER_OF_REVIEWERS,
        label: {
          text: 'How many reviewers are needed?',
          type: 'plain_text',
        },
        element: {
          type: 'plain_text_input',
          action_id: ActionId.NUMBER_OF_REVIEWERS,
          initial_value: '2',
          placeholder: {
            text: 'Enter a number...',
            type: 'plain_text',
          },
        },
      },
      {
        type: 'input',
        block_id: ActionId.CANDIDATE_IDENTIFIER,
        optional: true,
        label: {
          text: 'Enter a candidate identifier',
          type: 'plain_text',
        },
        element: {
          type: 'plain_text_input',
          action_id: ActionId.CANDIDATE_IDENTIFIER,
          initial_value: '',
          placeholder: {
            text: 'Enter an identifier...',
            type: 'plain_text',
          },
        },
      },
    ];
    if (HackParserIntegrationEnabled()) {
      blocks.push({
        type: 'input',
        block_id: ActionId.PDF_IDENTIFIER,
        label: {
          text: 'Input PDF File',
          type: 'plain_text',
        },
        element: {
          type: 'file_input',
          action_id: ActionId.PDF_IDENTIFIER,
          max_files: 1,
          filetypes: ['pdf'],
        },
      });
    }

    return {
      title: {
        text: 'Request a Review',
        type: 'plain_text',
      },
      type: 'modal',
      callback_id: Interaction.SUBMIT_REQUEST_REVIEW,
      blocks,
      submit: {
        type: 'plain_text',
        text: 'Submit',
      },
    };
  },

  async shortcut({ ack, shortcut, client }: ShortcutParam): Promise<void> {
    log.d('requestReview.shortcut', `Requesting review, user.id=${shortcut.user.id}`);
    await ack();

    try {
      const languages = await languageRepo.listAll();

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: this.dialog(languages),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const userId = shortcut.user.id;
      await chatService.sendDirectMessage(
        client,
        userId,
        compose('Something went wrong :/', codeBlock(err.message)),
      );
    }
  },

  async callback(params: CallbackParam): Promise<void> {
    const { ack, client, body } = params;
    await ack();

    if (!isViewSubmitActionParam(params)) {
      // TODO: How should we handle this case(if we need to)?
      log.d('callback called for non-submit action');
    }

    const user = body.user;
    const channel = process.env.INTERVIEWING_CHANNEL_ID;
    const numberOfInitialReviewers = Number(process.env.NUMBER_OF_INITIAL_REVIEWERS);
    const languages = blockUtils.getLanguageFromBody(body);
    const deadline = blockUtils.getBlockValue(body, ActionId.REVIEW_DEADLINE);
    const numberOfRequestedReviewers = blockUtils.getBlockValue(body, ActionId.NUMBER_OF_REVIEWERS);
    const candidateIdentifier = blockUtils.getBlockValue(body, ActionId.CANDIDATE_IDENTIFIER);

    let pdfIdentifier = '';
    // if HackParser is enabled AND the user uploaded a PDF file: download it from slack, and upload it to the HackParser S3 bucket
    if (HackParserIntegrationEnabled()) {
      const fileInput = blockUtils.getBlockValue(body, ActionId.PDF_IDENTIFIER);
      const pdf = fileInput?.files?.[0]; // type: https://api.slack.com/types/file
      if (pdf) {
        try {
          const pdfBuffer = await downloadUserUploadedFile(pdf.url_private_download);
          await uploadPDFToHackParserS3(pdf.name, pdfBuffer);
          pdfIdentifier = pdf.name;
        } catch (err) {
          log.e(
            'requestReview.callback',
            'Failed to download PDF from slack & upload to HackParser',
            err,
          );
        }
      }
    }

    const numberOfReviewersValue = numberOfRequestedReviewers.value;
    const deadlineValue = deadline.selected_option.value;
    const deadlineDisplay = deadline.selected_option.text.text;
    const candidateIdentifierValue = candidateIdentifier.value;
    log.d(
      'requestReview.callback',
      'Parsed values:',
      JSON.stringify({
        numberOfReviewersValue,
        candidateIdentifierValue,
        deadlineValue,
        deadlineDisplay,
        languages,
        user,
        channel,
      }),
    );

    const postMessageResult = await chatService.postTextMessage(
      client,
      channel,
      compose(
        `${mention(
          user,
        )} has requested ${numberOfReviewersValue} reviews for a HackerRank done in the following languages:`,
        ul(...languages),
        bold(`The review is needed by end of day ${deadlineDisplay}`),
        candidateIdentifierValue ? italic(`Candidate Identifier: ${candidateIdentifierValue}`) : '',
      ),
    );

    // @ts-expect-error Bolt types bad
    const threadId: string = postMessageResult.ts;
    log.d('Post message result:', postMessageResult);

    // wait for HackParser to work its magic in the background
    await waitForHackParser();

    const reviewers = await QueueService.getInitialUsersForReview(
      languages,
      numberOfInitialReviewers,
    );

    if (reviewers.length < numberOfReviewersValue) {
      log.d('There are not enough reviewers available for the selected languages!');
      await chatService.sendDirectMessage(
        client,
        user.id,
        `There are not enough reviewers available for the selected languages(${languages.concat(
          ',',
        )})! Found ${reviewers.length} users in the queue that match those languages.`,
      );
    }

    const pendingReviewers = [];

    for (const reviewer of reviewers) {
      const directMessageId = await chatService.getDirectMessageId(client, reviewer.id);
      const messageTimestamp = await chatService.sendRequestReviewMessage(
        this.app.client,
        directMessageId,
        threadId,
        { id: user.id },
        languages,
        deadlineDisplay,
      );
      const pendingReviewer: PendingReviewer = {
        userId: reviewer.id,
        expiresAt: determineExpirationTime(new Date()),
        messageTimestamp: messageTimestamp,
      };
      pendingReviewers.push(pendingReviewer);
    }

    await activeReviewRepo.create({
      threadId,
      requestorId: user.id,
      languages,
      requestedAt: new Date(),
      dueBy: deadlineValue,
      candidateIdentifier: candidateIdentifierValue,
      reviewersNeededCount: numberOfReviewersValue,
      acceptedReviewers: [],
      declinedReviewers: [],
      pendingReviewers: pendingReviewers,
      pdfIdentifier,
    });
  },
};

function buildDeadlineOptions(): PlainTextOption[] {
  return [
    buildOption(Deadline.END_OF_DAY),
    buildOption(Deadline.MONDAY),
    buildOption(Deadline.TUESDAY),
    buildOption(Deadline.WEDNESDAY),
    buildOption(Deadline.THURSDAY),
    buildOption(Deadline.FRIDAY),
  ];
}

function buildOption(deadline: Deadline): PlainTextOption {
  return { text: { text: DeadlineLabel.get(deadline) || '', type: 'plain_text' }, value: deadline };
}
