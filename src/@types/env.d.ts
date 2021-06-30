namespace NodeJS {
  interface ProcessEnv {
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
     * This is found in slack by: `right clicking the channel → Open Channel Details → Scroll
     * to the bottom of the "About" tab`
     */
    INTERVIEWING_CHANNEL_ID: string;
  }
}
