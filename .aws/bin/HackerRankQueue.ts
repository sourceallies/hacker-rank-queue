import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { HackerRankQueueStack } from '../lib/HackerRankQueueStack';

const app = new cdk.App();

/**
 * Return a context variable with an optional fallback
 *
 * @param context The context variable name set in `cdk.json` or with `-c` on the cli
 * @param fallback A fallback value if none are found
 * @returns The context value or the fallback if the value is not found. If a fallback was not
 *          provided and a variable is not found, it will throw an error.
 */
function ctx<T = any>(context: string, fallback?: T): T {
  const value = app.node.tryGetContext(context) ?? fallback;
  if (value == null) {
    throw Error(`[${context}] is a required context variable`);
  }
  return value;
}

const envName = process.env.ENV_NAME as 'prod' | 'dev';
const mode = ctx<'prod' | 'dev'>('mode', envName);
const modeConfig = ctx(mode);

new HackerRankQueueStack(app, 'HackerRankQueueStack', {
  env: {
    region: modeConfig.REGION,
    account: modeConfig.ACCOUNT_NUMBER,
  },
  mode,
  hostedZone: modeConfig.HOSTED_ZONE,
  environment: {
    SPREADSHEET_ID: modeConfig.SPREADSHEET_ID,
    INTERVIEWING_CHANNEL_ID: modeConfig.INTERVIEWING_CHANNEL_ID,
    ERRORS_CHANNEL_ID: modeConfig.ERRORS_CHANNEL_ID,
    ENCRYPTED_SLACK_BOT_TOKEN: modeConfig.ENCRYPTED_SLACK_BOT_TOKEN,
    ENCRYPTED_SLACK_SIGNING_SECRET: modeConfig.ENCRYPTED_SLACK_SIGNING_SECRET,
    ENCRYPTED_GOOGLE_PRIVATE_KEY: modeConfig.ENCRYPTED_GOOGLE_PRIVATE_KEY,
    ENCRYPTED_GOOGLE_SERVICE_ACCOUNT_EMAIL: modeConfig.ENCRYPTED_GOOGLE_SERVICE_ACCOUNT_EMAIL,
  },
});
