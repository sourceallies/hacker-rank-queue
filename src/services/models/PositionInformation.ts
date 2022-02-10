import { User } from '@models/User';

export interface PositionInformation {
  user: User;
  languagePositions: LanguagePosition[];
}

interface LanguagePosition {
  position: number;
  totalUsers: number;
  language: string;
}
