import { ActiveReview } from '@/database/models/ActiveReview';
import { WebClient } from '@/slackTypes';

export const expireRequest = moveOntoNextPerson(async () => {
  throw Error('Not implemented: RequestService.expireRequest callback');
});

export const declineRequest = moveOntoNextPerson(async () => {
  throw Error('Not implemented: RequestService.declineRequest callback');
});

/**
 * Notify the user if necessary, and request the next person in line
 */
function moveOntoNextPerson(_afterUserRemovedCallback: () => Promise<void>) {
  return (_client: WebClient, _activeReview: Readonly<ActiveReview>, _previousUserId: string) => {
    throw Error('Not implemented: RequestService.moveOntoNextPerson');
  };
}
