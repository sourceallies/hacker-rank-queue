import { View, Option } from '@slack/bolt';
import { Interaction, ActionId } from '../enums';

export function JoinQueueDialog(languages: string[]): View {
  return {
    title: {
      text: 'Join the HackerRank Queue',
      type: 'plain_text',
    },
    type: 'modal',
    callback_id: Interaction.SUBMIT_JOIN_QUEUE,

    blocks: [
      {
        type: 'input',
        label: {
          text: `What languages would you like to review?`,
          type: 'plain_text',
        },
        element: {
          type: 'checkboxes',
          action_id: ActionId.LANGUAGE_SELECTIONS,
          options: languages.map<Option>(lang => ({
            text: { text: lang, type: 'plain_text' },
            value: lang,
          })),
        },
      },
    ],

    submit: {
      type: 'plain_text',
      text: 'Submit',
    },
  };
}
