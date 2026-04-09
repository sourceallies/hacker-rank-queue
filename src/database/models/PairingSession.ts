import { InterviewFormat } from '@bot/enums';

export interface PairingSession {
  threadId: string;
  requestorId: string;
  candidateName: string;
  languages: string[];
  format: InterviewFormat;
  slots: PairingSlot[];
  requestedAt: Date;
  teammatesNeededCount: number;
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
