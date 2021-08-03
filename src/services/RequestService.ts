import { ActiveReview } from '@/database/models/ActiveReview';
import { WebClient } from '@/slackTypes';

/**
 * Notify users their time is up and request the next person
 */
export async function declineRequest(
  _client: WebClient,
  _activeReview: Readonly<ActiveReview>,
  _declinedUserId: string,
  _expiration = false,
): Promise<void> {
  throw Error('Not implemented: RequestService.declineRequest');
}
