export const enum Interaction {
  SHORTCUT_REQUEST_REVIEW = 'shortcut-request-review',
  SUBMIT_REQUEST_REVIEW = 'submit-request-review',

  SHORTCUT_JOIN_QUEUE = 'shortcut-join-queue',
  SUBMIT_JOIN_QUEUE = 'submit-join-queue',

  SHORTCUT_LEAVE_QUEUE = 'shortcut-leave-queue',

  SHORTCUT_TRIGGER_CRON = 'shortcut-trigger-cron',

  SHORTCUT_REQUEST_POSITION = 'shortcut-request-position',

  SHORTCUT_GET_REVIEW_INFO = 'shortcut-get-review-info',

  SHORTCUT_REQUEST_PAIRING = 'shortcut-request-pairing',
  SUBMIT_REQUEST_PAIRING = 'submit-request-pairing',
}

export const enum ActionId {
  LANGUAGE_SELECTIONS = 'language-selections',
  REVIEW_DEADLINE = 'review-deadline',
  NUMBER_OF_REVIEWERS = 'number-of-reviewers',
  CANDIDATE_IDENTIFIER = 'candidate-identifier',
  CANDIDATE_TYPE = 'candidate-type',
  REVIEWER_DM_ACCEPT = 'reviewer-dm-accept',
  REVIEWER_DM_DECLINE = 'reviewer-dm-deny',
  HACKERRANK_URL = 'hackerrank-url',
  YARDSTICK_URL = 'yardstick-url',
  INTERVIEW_TYPE_SELECTIONS = 'interview-type-selections',
  INTERVIEW_FORMAT_SELECTION = 'interview-format-selection',
  CANDIDATE_NAME = 'candidate-name',
  ADD_PAIRING_SLOT = 'add-pairing-slot',
  PAIRING_SLOT_SELECTIONS = 'pairing-slot-selections',
  PAIRING_SUBMIT_SLOTS = 'pairing-submit-slots',
  PAIRING_DECLINE_ALL = 'pairing-decline-all',
}

export const enum BlockId {
  REVIEWER_DM_CONTEXT = 'reviewer-dm-context',
  REVIEWER_DM_BUTTONS = 'reviewer-dm-buttons',
  PAIRING_DM_CONTEXT = 'pairing-dm-context',
  PAIRING_DM_SLOTS = 'pairing-dm-slots',
  PAIRING_DM_ACTIONS = 'pairing-dm-actions',
}

export const enum Deadline {
  END_OF_DAY = 'end-of-day',
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
}

export const DeadlineLabel = new Map<Deadline, string>([
  [Deadline.END_OF_DAY, 'Today'],
  [Deadline.MONDAY, 'Monday'],
  [Deadline.TUESDAY, 'Tuesday'],
  [Deadline.WEDNESDAY, 'Wednesday'],
  [Deadline.THURSDAY, 'Thursday'],
  [Deadline.FRIDAY, 'Friday'],
]);

export const enum CandidateType {
  FULL_TIME = 'full-time',
  APPRENTICE = 'apprentice',
}

export const CandidateTypeLabel = new Map<CandidateType, string>([
  [CandidateType.FULL_TIME, 'Full-time'],
  [CandidateType.APPRENTICE, 'Apprentice'],
]);

export const enum InterviewType {
  HACKERRANK = 'hackerrank',
  PAIRING = 'pairing',
}

export const InterviewTypeLabel = new Map<InterviewType, string>([
  [InterviewType.HACKERRANK, 'HackerRank Review'],
  [InterviewType.PAIRING, 'Pairing Interview'],
]);

export const enum InterviewFormat {
  REMOTE = 'remote',
  IN_PERSON = 'in-person',
  HYBRID = 'hybrid',
}

export const InterviewFormatLabel = new Map<InterviewFormat, string>([
  [InterviewFormat.REMOTE, 'Remote'],
  [InterviewFormat.IN_PERSON, 'In-Person'],
  [InterviewFormat.HYBRID, 'Hybrid'],
]);
