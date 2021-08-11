import { ActiveReview } from '@/database/models/ActiveReview';
import { WebClient } from '@/slackTypes';

export function expireRequest(
  client: WebClient,
  activeReview: Readonly<ActiveReview>,
  declinedUserId: string,
): Promise<void> {
  return moveOntoNextPerson(client, activeReview, declinedUserId, true);
}

export function declineRequest(
  client: WebClient,
  activeReview: Readonly<ActiveReview>,
  declinedUserId: string,
): Promise<void> {
  return moveOntoNextPerson(client, activeReview, declinedUserId, false);
}

/**
 * Notify the user if necessary, and request the next person in line
 */
async function moveOntoNextPerson(
  _client: WebClient,
  _activeReview: Readonly<ActiveReview>,
  _previousUserId: string,
  _expiration: boolean,
): Promise<void> {
  throw Error('Not implemented: RequestService.moveOntoNextPerson');
}
