export const enum Interaction {
  SHORTCUT_REQUEST_REVIEW = 'shortcut-request-review',
  SUBMIT_REQUEST_REVIEW = 'submit-request-review',

  SHORTCUT_JOIN_QUEUE = 'shortcut-join-queue',
  SUBMIT_JOIN_QUEUE = 'submit-join-queue',

  SHORTCUT_LEAVE_QUEUE = 'shortcut-leave-queue',

  SHORTCUT_TRIGGER_CRON = 'shortcut-trigger-cron',
}

export const enum ActionId {
  LANGUAGE_SELECTIONS = 'language-selections',
  REVIEW_DEADLINE = 'review-deadline',
  NUMBER_OF_REVIEWERS = 'number-of-reviewers',
}

export const enum Deadline {
  END_OF_DAY = 'end-of-day',
  TOMORROW = 'tomorrow',
  END_OF_WEEK = 'end-of-week',
  MONDAY = 'monday',
  NONE = 'none',
}
