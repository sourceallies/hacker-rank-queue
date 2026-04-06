import { InterviewFormat, InterviewType } from '@bot/enums';

export interface User {
  id: string;
  name: string;
  languages: string[];
  lastReviewedDate: number | undefined;
  lastPairingReviewedDate: number | undefined;
  interviewTypes: InterviewType[];
  formats: InterviewFormat[];
}
