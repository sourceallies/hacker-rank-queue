namespace NodeJS {
  interface ProcessEnv {
    /**
     * What environment we're running in
     */
    MODE: 'dev' | 'prod';

    /**
     * Port to run the bot on. Default: `3000`
     */
    PORT?: string;

    /**
     * The id of the spreadsheet to use as the database. It's taken from the
     * end of the url when the spreadsheet is open
     */
    SPREADSHEET_ID: string;

    /**
     * The Google Cloud service account's email address
     */
    GOOGLE_SERVICE_ACCOUNT_EMAIL: string;

    /**
     * The Google Cloud service account's private key
     */
    GOOGLE_PRIVATE_KEY: string;

    /**
     * `Bot User OAuth Token` from https://api.slack.com/apps/A01TFKZKPT7/oauth
     */
    SLACK_BOT_TOKEN: string;

    /**
     * `Signing Secret` from https://api.slack.com/apps/A01TFKZKPT7/general
     */
    SLACK_SIGNING_SECRET: string;

    /**
     * The ID of the channel that request review messages will be posted on. This is the primary
     * (and only) channel the bot will interact with outside of DMs.
     *
     * This ID is found in slack by: `right clicking the channel → Open Channel Details → Scroll
     * to the bottom of the "About" tab`
     *
     * When adding a new channel, you need to run the following command in that channel in Slack:
     *
     * ```text
     * /invite @HackerRank Queue
     * ```
     */
    INTERVIEWING_CHANNEL_ID: string;

    /**
     * The ID of the channel that the bot posts to when it encounters a system error. Generally this
     * is only used for errors that occur outside of a user interaction (like cron jobs) because we
     * can tell the user directly when there is an error. This is more useful when the error wasn't
     * caused by a user interaction
     *
     * This ID is found in slack by: `right clicking the channel → Open Channel Details → Scroll
     * to the bottom of the "About" tab`
     *
     * When adding a new channel, you need to run the following command in that channel in Slack:
     *
     * ```text
     * /invite @HackerRank Queue
     * ```
     */
    ERRORS_CHANNEL_ID: string;

    /**
     * How many teammates each wave of offers goes to, including the first wave when a request is
     * created. Must be a positive integer.
     */
    NUMBER_OF_INITIAL_REVIEWERS: string;

    /**
     * How many business days (working hours, weekdays) a request can stay open without filling
     * before it closes as unfulfilled. Counted from when it was requested. Positive integer;
     * defaults to 1 when unset or invalid.
     */
    REQUEST_CLOSE_BUSINESS_DAYS?: string;

    /**
     * Minutes after the newest offer on a request before the next wave of offers goes out. Wave
     * size is `NUMBER_OF_INITIAL_REVIEWERS`. Positive integer; defaults to 30.
     */
    WAVE_INTERVAL_MIN?: string;

    /**
     * The hour (0-23) when the workday starts. Used for calculating review request expiration times.
     * Should be in America/Chicago timezone.
     */
    WORKDAY_START_HOUR: string;

    /**
     * The hour (0-23) when the workday ends. Used for calculating review request expiration times.
     * Should be in America/Chicago timezone.
     */
    WORKDAY_END_HOUR: string;
  }
}
