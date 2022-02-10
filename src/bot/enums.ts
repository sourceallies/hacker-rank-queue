export const enum Interaction {
  SHORTCUT_REQUEST_REVIEW = 'shortcut-request-review',
  SUBMIT_REQUEST_REVIEW = 'submit-request-review',

  SHORTCUT_JOIN_QUEUE = 'shortcut-join-queue',
  SUBMIT_JOIN_QUEUE = 'submit-join-queue',

  SHORTCUT_LEAVE_QUEUE = 'shortcut-leave-queue',

  SHORTCUT_TRIGGER_CRON = 'shortcut-trigger-cron',

  SHORTCUT_REQUEST_POSITION = 'shortcut-request-position',
}

export const enum ActionId {
  LANGUAGE_SELECTIONS = 'language-selections',
  REVIEW_DEADLINE = 'review-deadline',
  NUMBER_OF_REVIEWERS = 'number-of-reviewers',
  REVIEWER_DM_ACCEPT = 'reviewer-dm-accept',
  REVIEWER_DM_DECLINE = 'reviewer-dm-deny',
}

export const enum BlockId {
  REVIEWER_DM_CONTEXT = 'reviewer-dm-context',
  REVIEWER_DM_BUTTONS = 'reviewer-dm-buttons',
  REVIEWER_DM_ACKNOWLEDGE = 'reviewer-dm-acknowledge',
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
  [Deadline.END_OF_DAY, 'End of day'],
  [Deadline.MONDAY, 'Monday'],
  [Deadline.TUESDAY, 'Tuesday'],
  [Deadline.WEDNESDAY, 'Wednesday'],
  [Deadline.THURSDAY, 'Thursday'],
  [Deadline.FRIDAY, 'Friday'],
]);
