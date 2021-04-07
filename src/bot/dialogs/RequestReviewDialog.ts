import { View } from '@slack/bolt';
import { Interaction } from '../enums';

export function RequestReviewDialog(): View {
  return {
    title: {
      text: 'Request a HackerRank Review',
      type: 'plain_text',
    },
    type: 'modal',
    callback_id: Interaction.SUBMIT_REQUEST_REVIEW,
    blocks: [],
  };
}
