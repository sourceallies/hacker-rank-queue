# Glossary

The words this app uses for its domain, what each one means, and where it lives in the code. Use
these names in code, tests, PRs and Slack copy. When two words compete for one idea, the **Avoid**
line says which one loses.

The bot handles two kinds of interview. Both follow the same shape: a **recruiter** asks, the bot
**offers** it down the **queue** one **teammate** at a time, and the request **closes** once enough
people say yes or nobody is left to ask.

## People

**Teammate**
Anyone who has joined the queue. Stored as a `User` row in the `users` sheet.
_Avoid:_ "interviewer" for the general case. A teammate becomes a **reviewer** or **pairing
teammate** only once they're offered a specific request.

**Recruiter**
The person who asks for a review or pairing session. Stored as `requestorId`.
_Avoid:_ "requester" in new code (the field is `requestorId`, so match it).

**Reviewer**
A teammate offered a specific HackerRank review. They're pending, accepted or declined
(`pendingReviewers`, `acceptedReviewers`, `declinedReviewers` on `ActiveReview`).

**Pairing teammate**
A teammate offered a specific pairing session. They're pending, declined, or "interested" in one
or more slots (`pendingTeammates`, `declinedTeammates`, `PairingSlot.interestedTeammates`).
_Avoid:_ "reviewer" for pairing, though older names still say it (`lastPairingReviewedDate`,
`NUMBER_OF_INITIAL_REVIEWERS`).

**Candidate**
The person being interviewed. A review names them with a free-text `candidateIdentifier`. A
pairing session uses `candidateName`. Candidates never see the bot.

## The two interview types

**Interview type**
Which kinds of interview a teammate takes part in: `hackerrank` or `pairing` (`InterviewType`).
Chosen in **Interview Queue Preferences**. A teammate only enters a queue for the types they picked.

**HackerRank review** (also just **review**)
An async code review of a candidate's HackerRank assessment. Created with the **Request a
Review** shortcut. Stored as an `ActiveReview` in the `active_reviews` sheet until it closes.
Reviewers get links to the HackerRank report and the **Yardstick** results form.
_Avoid:_ "review" for pairing sessions. Some code and DM copy still does, e.g. `getReviewInfo`
covers both.

**Pairing session**
A live pairing interview, scheduled into one slot. Created with the **Request Pairing Session**
shortcut. Stored as a `PairingSession` in the `pairing_sessions` sheet until it closes.
_Avoid:_ "interview" as a variable name for a session. Older code uses it (`interview`,
`ExpiredPairingRequest.interview`). New code should say `session`.

**Candidate type**
`full-time` or `apprentice` (`CandidateType`). On a pairing session it sets the session length:
3 hours for full-time, 2 for apprentice (`SESSION_HOURS`). Rows from before this existed read as
full-time.

**Languages**
The programming languages a request needs, and the ones a teammate is comfortable with. A
teammate is only offered a request when at least one language matches. The list of choices
lives in the `languages` sheet.

## The queue

**Queue**
The order teammates are offered requests in. The teammate who has gone longest without one goes
first, and anyone who has never had one goes ahead of everyone (in random order among
themselves). Reviews sort by `lastReviewedDate` and pairing by `lastPairingReviewedDate`. The two
queues are separate: a review doesn't move your pairing position.
_Avoid:_ "list" or "rotation".

**Position in queue**
Where a teammate sits in the review queue, per language. Shown by the **request position**
shortcut (`PositionInQueueService`). Covers HackerRank only.

**Join / leave the queue**
Saving **Interview Queue Preferences** adds or updates your `users` row. **Leave Queue** removes it. A
nightly job (`checkAllUsersActive`) also removes teammates who left the Slack workspace, and
posts a reminder to lock their HackerRank accounts.

## A request's life

**Request**
What a recruiter creates: one review or one pairing session. Each gets a parent message in the
interviewing channel, and that message's Slack timestamp is its **thread ID** (`threadId`).
Status updates are posted as replies in that thread.

**Thread ID**
The key for a request, in both sheets and in code. It's a Slack `ts` like `1712345678.123456`
and must be stored as text, because Sheets will round it if it's treated as a number.

**Offer**
A DM asking one teammate to take a request. The first offers go to the top of the queue, up to
`NUMBER_OF_INITIAL_REVIEWERS` (5) people. Every decline or expiry sends one new offer to the
next person in line.
_Avoid:_ "request" for the DM itself. The request is the whole review or session.

**Pending**
Offered and not answered yet. A teammate can be pending on only one review at a time and on
only one pairing session at a time. The queue skips anyone already pending elsewhere.

**Expire / expiry**
An offer that isn't answered in time counts as a decline, and the teammate keeps their place in
the queue. The time limit is `REQUEST_EXPIRATION_MIN`, counted in working hours only
(`WORKDAY_START_HOUR` to `WORKDAY_END_HOUR`, weekdays). The expire crons check every 15 minutes
during those hours.

**Accept** (review)
A reviewer takes the review. Their `lastReviewedDate` resets, which sends them to the back of
the review queue.

**Decline**
Saying no, by button or by expiry. A declined teammate is never offered that request again.

**Close**
A request is done and its row is deleted from the sheet. Either:

- **Complete**: a review has enough accepted reviewers, or a pairing session has a confirmed
  slot.
- **Unfulfilled**: no one is pending and no one is left in line. The recruiter gets a note in
  the thread, which for pairing lists anyone who did sign up.

**Thread record**
The stored row for one request: an `ActiveReview` or a `PairingSession`. Every handler or cron
that reads one and then changes it goes through `ThreadRecords` (`activeReviews`,
`pairingSessions`). It holds a per-thread lock, so two clicks, or a click and a cron, can't
overwrite each other's changes.

## Pairing scheduling

**Availability window**
A stretch of time the candidate told the recruiter they're free, e.g. "Tuesday 8:00–17:00"
(`AvailabilityWindow`). Stored as entered, because slots can't be turned back into windows.

**Slot**
One bookable session, sliced out of a window. Slots start on the hour and only where the whole
session fits before the window ends (`PairingSlot`, `sliceWindow`). An 8:00–17:00 window with a
3-hour session yields starts at 8 through 14.
_Avoid:_ "time" in code. "Times" is fine in Slack copy ("Pick your times").

**Picker**
The **Pick your times** modal a pairing teammate opens from their offer, to choose any number
of slots or pass (`pickPairingTimes`, `pairingPicker`).

**Interested teammate**
A pairing teammate who picked a slot. Stored on that slot, with their formats as they were when
they picked (`InterestedTeammate`).

**Teammates needed**
How many teammates each slot needs (`teammatesNeededCount`). A slot with that many stops taking
more.

**Confirmed slot**
A slot with enough interested teammates. For a hybrid session, at least one of them must also
be in person (`isSlotConfirmed`). A session closes as complete as soon as any slot is confirmed,
and the thread lists every confirmed slot so the recruiter can schedule one. Everyone on a
confirmed slot has their `lastPairingReviewedDate` reset, which sends them to the back of the
pairing queue.

**Standing**
Where one pairing teammate is with one session: `pending`, `responded`, `gone` (the session
closed) or `setting-up` (the offer arrived before the row was saved). Decides what the bot tells
them when they click (`standingOf`).

**Interview format**
`remote`, `in-person` or `hybrid` (`InterviewFormat`).

- A teammate lists the formats they can do.
- A session has one format.
- An in-person session is only offered to in-person teammates.
- A hybrid session is offered to anyone, but needs one in-person teammate per confirmed slot.
  When a slot has one seat left and no in-person teammate yet, only an in-person teammate can
  take that seat.

## Infrastructure words

**Sheet**
A tab in the Google Spreadsheet that serves as the database: `users`, `languages`,
`active_reviews`, `pairing_sessions`. Each has a repo in `src/database/repos/`.

**Shortcut**
A Slack global shortcut that opens one of the bot's modals: Interview Queue Preferences, Request a Review,
Request Pairing Session, review info, and position in queue.

**Errors channel**
Where the bot reports anything it couldn't handle (`ERRORS_CHANNEL_ID`, `reportErrorAndContinue`).
