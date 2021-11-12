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
     * How long each request should stay around for before expiring. Units are minutes, decimals are
     * allowed.
     */
    REQUEST_EXPIRATION_MIN: string;
  }
}
